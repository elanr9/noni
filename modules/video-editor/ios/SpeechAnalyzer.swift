import AVFoundation
import ExpoModulesCore

internal struct SpeechBounds {
  let startMs: Double
  let endMs: Double
  let durationMs: Double

  var dictionary: [String: Any] {
    ["startMs": startMs, "endMs": endMs, "durationMs": durationMs]
  }
}

/// Finds where speech starts and ends in a clip from short term RMS levels,
/// so the editor can trim the silence before and after the creator talks.
internal enum SpeechAnalyzer {
  private static let sampleRate: Double = 16_000
  private static let windowMs: Double = 20
  private static let leadPadMs: Double = 120
  private static let tailPadMs: Double = 250
  private static let minSustainMs: Double = 100
  private static let minResultMs: Double = 400
  private static let floorLiftDb: Float = 12
  private static let minThresholdDb: Float = -40

  static func bounds(uri: String) async throws -> SpeechBounds {
    try await Task.detached(priority: .userInitiated) {
      try await Self.analyze(uri: uri)
    }.value
  }

  private static func analyze(uri: String) async throws -> SpeechBounds {
    let asset = AVURLAsset(url: try AssetCache.url(from: uri))
    let duration = try await asset.load(.duration)
    let durationMs = duration.isNumeric ? max(duration.seconds, 0) * 1000 : 0
    let whole = SpeechBounds(startMs: 0, endMs: durationMs, durationMs: durationMs)

    guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
      return whole
    }
    let levels = try windowLevels(asset: asset, track: track)
    guard !levels.isEmpty else { return whole }

    let sorted = levels.sorted()
    let noiseFloor = sorted[Int(Double(sorted.count - 1) * 0.1)]
    let threshold = max(noiseFloor + floorLiftDb, minThresholdDb)
    let sustain = Int(minSustainMs / windowMs)

    // A window counts as speech when it starts a run that stays above the
    // threshold for at least minSustainMs after it.
    var firstIndex: Int? = nil
    var lastIndex: Int? = nil
    var runStart: Int? = nil
    for index in 0...levels.count {
      let above = index < levels.count && levels[index] > threshold
      if above {
        if runStart == nil { runStart = index }
        continue
      }
      if let start = runStart, index - start > sustain {
        if firstIndex == nil { firstIndex = start }
        lastIndex = index - 1
      }
      runStart = nil
    }
    guard let first = firstIndex, let last = lastIndex else { return whole }

    let startMs = max(0, Double(first) * windowMs - leadPadMs)
    let endMs = min(durationMs, Double(last + 1) * windowMs + tailPadMs)
    guard endMs - startMs >= minResultMs else { return whole }
    return SpeechBounds(startMs: startMs, endMs: endMs, durationMs: durationMs)
  }

  /// RMS level in dBFS of every 20 ms window of the track, decoded as mono
  /// float PCM at 16 kHz.
  private static func windowLevels(asset: AVAsset, track: AVAssetTrack) throws -> [Float] {
    let reader = try AVAssetReader(asset: asset)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else {
      throw VideoEditorException("Could not read the audio track")
    }
    reader.add(output)
    guard reader.startReading() else {
      throw VideoEditorException(reader.error?.localizedDescription ?? "Could not read the audio track")
    }

    let windowSize = Int(sampleRate * windowMs / 1000)
    var levels: [Float] = []
    var sumSquares: Float = 0
    var count = 0

    while let sample = output.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      guard length > 0 else { continue }
      var samples = [Float](repeating: 0, count: length / MemoryLayout<Float>.size)
      let status = samples.withUnsafeMutableBytes { buffer -> OSStatus in
        guard let base = buffer.baseAddress else { return kCMBlockBufferBadPointerParameterErr }
        return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: base)
      }
      guard status == kCMBlockBufferNoErr else { continue }
      for value in samples {
        sumSquares += value * value
        count += 1
        if count == windowSize {
          levels.append(dbfs(meanSquare: sumSquares / Float(count)))
          sumSquares = 0
          count = 0
        }
      }
    }
    if count > 0 {
      levels.append(dbfs(meanSquare: sumSquares / Float(count)))
    }
    if reader.status == .failed {
      throw VideoEditorException(reader.error?.localizedDescription ?? "Could not read the audio track")
    }
    return levels
  }

  private static func dbfs(meanSquare: Float) -> Float {
    10 * log10(max(meanSquare, 1e-10))
  }
}
