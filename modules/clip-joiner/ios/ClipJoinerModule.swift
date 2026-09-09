import AVFoundation
import ExpoModulesCore

internal final class ClipJoinException: GenericException<String> {
  override var reason: String {
    "Failed to join clips: \(param)"
  }
}

private struct VideoSegment {
  let asset: AVURLAsset
  let videoTrack: AVAssetTrack
  let audioTrack: AVAssetTrack?
  let naturalSize: CGSize
  let preferredTransform: CGAffineTransform
  let duration: CMTime

  var orientedRect: CGRect {
    CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
  }

  var orientedSize: CGSize {
    CGSize(width: abs(orientedRect.width), height: abs(orientedRect.height))
  }
}

public class ClipJoinerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipJoiner")

    AsyncFunction("joinClips") { (uris: [String], promise: Promise) in
      Task {
        do {
          let outputUrl = try await Self.join(uris: uris)
          promise.resolve(outputUrl.absoluteString)
        } catch let exception as Exception {
          promise.reject(exception)
        } catch {
          promise.reject(ClipJoinException(error.localizedDescription))
        }
      }
    }
  }

  private static func fileUrl(from uri: String) throws -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return url
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    throw ClipJoinException("Unsupported clip URI: \(uri)")
  }

  private static func loadSegment(uri: String) async throws -> VideoSegment {
    let url = try fileUrl(from: uri)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw ClipJoinException("Clip does not exist at \(url.path)")
    }
    let asset = AVURLAsset(url: url)
    guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
      throw ClipJoinException("Clip has no video track: \(url.lastPathComponent)")
    }
    let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
    let (naturalSize, preferredTransform, timeRange) = try await videoTrack.load(
      .naturalSize, .preferredTransform, .timeRange
    )
    return VideoSegment(
      asset: asset,
      videoTrack: videoTrack,
      audioTrack: audioTrack,
      naturalSize: naturalSize,
      preferredTransform: preferredTransform,
      duration: timeRange.duration
    )
  }

  private static func evenRounded(_ value: CGFloat) -> CGFloat {
    let rounded = value.rounded()
    return rounded.truncatingRemainder(dividingBy: 2) == 0 ? rounded : rounded + 1
  }

  private static func layerTransform(for segment: VideoSegment, renderSize: CGSize) -> CGAffineTransform {
    let oriented = segment.orientedRect
    let orientedSize = segment.orientedSize
    let moveToOrigin = CGAffineTransform(translationX: -oriented.minX, y: -oriented.minY)
    let scale = max(renderSize.width / orientedSize.width, renderSize.height / orientedSize.height)
    let scaled = CGAffineTransform(scaleX: scale, y: scale)
    let centered = CGAffineTransform(
      translationX: (renderSize.width - orientedSize.width * scale) / 2,
      y: (renderSize.height - orientedSize.height * scale) / 2
    )
    return segment.preferredTransform
      .concatenating(moveToOrigin)
      .concatenating(scaled)
      .concatenating(centered)
  }

  private static func join(uris: [String]) async throws -> URL {
    guard !uris.isEmpty else {
      throw ClipJoinException("No clips were provided")
    }

    var segments: [VideoSegment] = []
    for uri in uris {
      segments.append(try await loadSegment(uri: uri))
    }

    let composition = AVMutableComposition()
    guard let compositionVideoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw ClipJoinException("Could not create composition video track")
    }
    let compositionAudioTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    )

    let firstOriented = segments[0].orientedSize
    let renderSize = CGSize(width: evenRounded(firstOriented.width), height: evenRounded(firstOriented.height))

    var instructions: [AVMutableVideoCompositionInstruction] = []
    var cursor = CMTime.zero

    for segment in segments {
      let segmentRange = CMTimeRange(start: .zero, duration: segment.duration)
      try compositionVideoTrack.insertTimeRange(segmentRange, of: segment.videoTrack, at: cursor)

      if let audioTrack = segment.audioTrack, let compositionAudioTrack {
        let audioTimeRange = try await audioTrack.load(.timeRange)
        let audioDuration = CMTimeMinimum(audioTimeRange.duration, segment.duration)
        let audioRange = CMTimeRange(start: audioTimeRange.start, duration: audioDuration)
        try compositionAudioTrack.insertTimeRange(audioRange, of: audioTrack, at: cursor)
      }

      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
      layerInstruction.setTransform(layerTransform(for: segment, renderSize: renderSize), at: cursor)

      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: segment.duration)
      instruction.layerInstructions = [layerInstruction]
      instructions.append(instruction)

      cursor = CMTimeAdd(cursor, segment.duration)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    let outputUrl = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("clip-join-\(UUID().uuidString).mp4")
    try? FileManager.default.removeItem(at: outputUrl)

    guard let exportSession = AVAssetExportSession(
      asset: composition,
      presetName: AVAssetExportPresetHighestQuality
    ) else {
      throw ClipJoinException("Could not create export session")
    }
    exportSession.outputURL = outputUrl
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true
    exportSession.videoComposition = videoComposition

    await exportSession.export()

    switch exportSession.status {
    case .completed:
      return outputUrl
    case .cancelled:
      throw ClipJoinException("Export was cancelled")
    default:
      let message = exportSession.error?.localizedDescription ?? "Unknown export error"
      throw ClipJoinException(message)
    }
  }
}
