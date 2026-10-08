import AVFoundation
import ExpoModulesCore

internal final class VideoEditorException: GenericException<String> {
  override var reason: String {
    param
  }
}

internal func videoEditorErrorMessage(_ error: Error) -> String {
  if let exception = error as? Exception {
    return exception.reason
  }
  return error.localizedDescription
}

internal struct LoadedAsset {
  let asset: AVURLAsset
  let videoTrack: AVAssetTrack
  let audioTrack: AVAssetTrack?
  let naturalSize: CGSize
  let preferredTransform: CGAffineTransform
  let duration: CMTime
  let audioDuration: CMTime

  var orientedRect: CGRect {
    CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
  }

  var orientedSize: CGSize {
    CGSize(width: abs(orientedRect.width), height: abs(orientedRect.height))
  }
}

internal actor AssetCache {
  private var loaded: [String: LoadedAsset] = [:]
  private var inFlight: [String: Task<LoadedAsset, Error>] = [:]

  func asset(for uri: String) async throws -> LoadedAsset {
    if let cached = loaded[uri] {
      return cached
    }
    if let task = inFlight[uri] {
      return try await task.value
    }
    let task = Task.detached(priority: .userInitiated) {
      try await AssetCache.load(uri: uri)
    }
    inFlight[uri] = task
    defer { inFlight[uri] = nil }
    let asset = try await task.value
    loaded[uri] = asset
    return asset
  }

  static func url(from uri: String) throws -> URL {
    if uri.hasPrefix("file://") || uri.hasPrefix("http://") || uri.hasPrefix("https://") {
      guard let url = URL(string: uri) else {
        throw VideoEditorException("Invalid media URI: \(uri)")
      }
      return url
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    throw VideoEditorException("Unsupported media URI: \(uri)")
  }

  private static func load(uri: String) async throws -> LoadedAsset {
    let url = try url(from: uri)
    if url.isFileURL, !FileManager.default.fileExists(atPath: url.path) {
      throw VideoEditorException("Media file does not exist at \(url.path)")
    }
    let asset = AVURLAsset(url: url)
    guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
      throw VideoEditorException("Media has no video track: \(url.lastPathComponent)")
    }
    let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
    let (naturalSize, preferredTransform, timeRange) = try await videoTrack.load(
      .naturalSize, .preferredTransform, .timeRange
    )
    let audioRange = try await audioTrack?.load(.timeRange)
    return LoadedAsset(
      asset: asset,
      videoTrack: videoTrack,
      audioTrack: audioTrack,
      naturalSize: naturalSize,
      preferredTransform: preferredTransform,
      duration: timeRange.duration,
      audioDuration: audioRange?.duration ?? .zero
    )
  }
}

internal struct BuiltTimeline {
  let composition: AVMutableComposition
  let videoComposition: AVMutableVideoComposition
  let durationMs: Double
}

internal enum CompositionBuilder {
  static let frameDuration = CMTime(value: 1, timescale: 30)
  private static let timescale: CMTimeScale = 600

  static func build(timeline: TimelineRecord, cache: AssetCache) async throws -> BuiltTimeline {
    if timeline.isBlockTimeline {
      return try await buildBlocks(timeline.blocks, cache: cache)
    }
    guard !timeline.pieces.isEmpty else {
      throw VideoEditorException("Timeline has no pieces")
    }

    var assets: [LoadedAsset] = []
    for piece in timeline.pieces {
      assets.append(try await cache.asset(for: piece.uri))
    }

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw VideoEditorException("Could not create composition video track")
    }
    let audioTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    )

    let firstOriented = assets[0].orientedSize
    let renderSize = CGSize(
      width: evenRounded(firstOriented.width),
      height: evenRounded(firstOriented.height)
    )

    var instructions: [AVMutableVideoCompositionInstruction] = []
    var cursor = CMTime.zero

    for (piece, asset) in zip(timeline.pieces, assets) {
      let sourceRange = sourceRange(for: piece, in: asset)
      try videoTrack.insertTimeRange(sourceRange, of: asset.videoTrack, at: cursor)

      var insertedAudioDuration: CMTime?
      if !piece.muted, let sourceAudio = asset.audioTrack, let audioTrack {
        let available = CMTimeSubtract(asset.audioDuration, sourceRange.start)
        let audioDuration = CMTimeMinimum(sourceRange.duration, available)
        if audioDuration > .zero {
          let audioRange = CMTimeRange(start: sourceRange.start, duration: audioDuration)
          try audioTrack.insertTimeRange(audioRange, of: sourceAudio, at: cursor)
          insertedAudioDuration = audioDuration
        }
      }

      let speed = piece.speed.isFinite && piece.speed > 0 ? piece.speed : 1
      var scaledDuration = sourceRange.duration
      if speed != 1 {
        scaledDuration = CMTimeMultiplyByFloat64(sourceRange.duration, multiplier: 1 / speed)
        videoTrack.scaleTimeRange(
          CMTimeRange(start: cursor, duration: sourceRange.duration),
          toDuration: scaledDuration
        )
        if let insertedAudioDuration, let audioTrack {
          audioTrack.scaleTimeRange(
            CMTimeRange(start: cursor, duration: insertedAudioDuration),
            toDuration: CMTimeMultiplyByFloat64(insertedAudioDuration, multiplier: 1 / speed)
          )
        }
      }

      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      layerInstruction.setTransform(
        transform(for: asset, crop: piece.crop, renderSize: renderSize),
        at: cursor
      )

      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: scaledDuration)
      instruction.layerInstructions = [layerInstruction]
      instructions.append(instruction)

      cursor = CMTimeAdd(cursor, scaledDuration)
    }

    // Track insertion snaps to sample boundaries, so the composition can end a tick
    // away from the cursor. Stretch the last instruction to cover it exactly.
    let total = composition.duration
    if let last = instructions.last, total > last.timeRange.start {
      last.timeRange = CMTimeRange(start: last.timeRange.start, end: total)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = frameDuration
    videoComposition.instructions = instructions

    return BuiltTimeline(
      composition: composition,
      videoComposition: videoComposition,
      durationMs: total.seconds * 1000
    )
  }

  // MARK: Blocks

  /// The studio document: blocks in timeline order with one or two cells.
  /// Cell i always lives on video track i and audio track i, the render is
  /// always 1080x1920, and a block lasts `durationMs` (the shortest cell).
  /// Image cells insert no media; their time is kept with empty ranges so
  /// composition time equals document time and JS draws the picture over
  /// the player for that window.
  static let blockRenderSize = CGSize(width: 1080, height: 1920)

  private static func buildBlocks(_ blocks: [BlockRecord], cache: AssetCache) async throws -> BuiltTimeline {
    guard !blocks.isEmpty else {
      throw VideoEditorException("Timeline has no blocks")
    }

    var assets: [String: LoadedAsset] = [:]
    var trackCount = 0
    for block in blocks {
      for (index, cell) in block.cells.enumerated() where cell.isVideo {
        trackCount = max(trackCount, index + 1)
        if assets[cell.uri] == nil {
          assets[cell.uri] = try await cache.asset(for: cell.uri)
        }
      }
    }
    guard trackCount > 0 else {
      throw VideoEditorException("Timeline has no video cells")
    }

    let composition = AVMutableComposition()
    var videoTracks: [AVMutableCompositionTrack] = []
    var audioTracks: [AVMutableCompositionTrack?] = []
    var videoEnds: [CMTime] = []
    var audioEnds: [CMTime] = []
    for _ in 0..<trackCount {
      guard let videoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
      ) else {
        throw VideoEditorException("Could not create composition video track")
      }
      videoTracks.append(videoTrack)
      audioTracks.append(composition.addMutableTrack(
        withMediaType: .audio,
        preferredTrackID: kCMPersistentTrackID_Invalid
      ))
      videoEnds.append(.zero)
      audioEnds.append(.zero)
    }

    var instructions: [AVMutableVideoCompositionInstruction] = []
    var cursor = CMTime.zero

    for block in blocks {
      let blockDuration = blockDuration(for: block)
      guard blockDuration > .zero else { continue }
      var layers: [AVMutableVideoCompositionLayerInstruction] = []

      for (index, cell) in block.cells.enumerated() where index < trackCount {
        guard cell.isVideo, let asset = assets[cell.uri] else { continue }
        let speed = cell.speed.isFinite && cell.speed > 0 ? cell.speed : 1
        let wanted = CMTimeMultiplyByFloat64(blockDuration, multiplier: speed)
        let sourceRange = sourceRange(for: cell, in: asset, maxDuration: wanted)
        let videoTrack = videoTracks[index]

        if videoEnds[index] < cursor {
          videoTrack.insertEmptyTimeRange(CMTimeRange(start: videoEnds[index], end: cursor))
        }
        try videoTrack.insertTimeRange(sourceRange, of: asset.videoTrack, at: cursor)
        var scaledDuration = sourceRange.duration
        if speed != 1 {
          scaledDuration = CMTimeMultiplyByFloat64(sourceRange.duration, multiplier: 1 / speed)
          videoTrack.scaleTimeRange(
            CMTimeRange(start: cursor, duration: sourceRange.duration),
            toDuration: scaledDuration
          )
        }
        videoEnds[index] = CMTimeAdd(cursor, scaledDuration)

        if !cell.muted, let sourceAudio = asset.audioTrack, let audioTrack = audioTracks[index] {
          let available = CMTimeSubtract(asset.audioDuration, sourceRange.start)
          let audioDuration = CMTimeMinimum(sourceRange.duration, available)
          if audioDuration > .zero {
            if audioEnds[index] < cursor {
              audioTrack.insertEmptyTimeRange(CMTimeRange(start: audioEnds[index], end: cursor))
            }
            try audioTrack.insertTimeRange(
              CMTimeRange(start: sourceRange.start, duration: audioDuration),
              of: sourceAudio,
              at: cursor
            )
            var scaledAudio = audioDuration
            if speed != 1 {
              scaledAudio = CMTimeMultiplyByFloat64(audioDuration, multiplier: 1 / speed)
              audioTrack.scaleTimeRange(
                CMTimeRange(start: cursor, duration: audioDuration),
                toDuration: scaledAudio
              )
            }
            audioEnds[index] = CMTimeAdd(cursor, scaledAudio)
          }
        }

        let rect = cellRect(layout: block.layout, index: index)
        let cellTransform = transform(for: asset, crop: cell.crop, renderSize: rect.size)
          .concatenating(CGAffineTransform(translationX: rect.minX, y: rect.minY))
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        layer.setTransform(cellTransform, at: cursor)
        layer.setCropRectangle(
          sourceCropRect(for: asset, transform: cellTransform, cellRect: rect),
          at: cursor
        )
        layers.append(layer)
      }

      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: blockDuration)
      instruction.layerInstructions = layers
      instructions.append(instruction)
      cursor = CMTimeAdd(cursor, blockDuration)
    }

    guard !instructions.isEmpty else {
      throw VideoEditorException("Timeline has no playable blocks")
    }

    // Image only blocks at the tail would leave every track short of the
    // document end; pad the first track so the composition lasts the document.
    if videoEnds[0] < cursor {
      videoTracks[0].insertEmptyTimeRange(CMTimeRange(start: videoEnds[0], end: cursor))
    }

    let total = composition.duration
    if let last = instructions.last, total > last.timeRange.start {
      last.timeRange = CMTimeRange(start: last.timeRange.start, end: total)
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = blockRenderSize
    videoComposition.frameDuration = frameDuration
    videoComposition.instructions = instructions

    return BuiltTimeline(
      composition: composition,
      videoComposition: videoComposition,
      durationMs: total.seconds * 1000
    )
  }

  private static func blockDuration(for block: BlockRecord) -> CMTime {
    if block.durationMs.isFinite && block.durationMs > 0 {
      return time(fromMs: block.durationMs)
    }
    let cellMs = block.cells.map { cell -> Double in
      let speed = cell.speed.isFinite && cell.speed > 0 ? cell.speed : 1
      return max(cell.outMs - cell.inMs, 0) / speed
    }
    return time(fromMs: cellMs.min() ?? 0)
  }

  private static func sourceRange(for cell: CellRecord, in asset: LoadedAsset, maxDuration: CMTime) -> CMTimeRange {
    let assetRange = CMTimeRange(start: .zero, duration: asset.duration)
    var start = CMTimeClampToRange(time(fromMs: cell.inMs), range: assetRange)
    let end = CMTimeClampToRange(time(fromMs: cell.outMs), range: assetRange)
    var duration = CMTimeMinimum(CMTimeSubtract(end, start), maxDuration)
    if duration < frameDuration {
      duration = CMTimeMinimum(frameDuration, asset.duration)
      start = CMTimeMinimum(start, CMTimeSubtract(asset.duration, duration))
    }
    return CMTimeRange(start: start, duration: duration)
  }

  private static func cellRect(layout: String, index: Int) -> CGRect {
    let size = blockRenderSize
    switch layout {
    case "split_v":
      let half = size.height / 2
      return CGRect(x: 0, y: index == 0 ? 0 : half, width: size.width, height: half)
    case "split_h":
      let half = size.width / 2
      return CGRect(x: index == 0 ? 0 : half, y: 0, width: half, height: size.height)
    default:
      return CGRect(origin: .zero, size: size)
    }
  }

  /// The crop rectangle is in the track's own pixel space before the layer
  /// transform, so the cell is mapped back through the inverse transform.
  private static func sourceCropRect(for asset: LoadedAsset, transform: CGAffineTransform, cellRect: CGRect) -> CGRect {
    let natural = CGRect(origin: .zero, size: asset.naturalSize)
    let determinant = transform.a * transform.d - transform.b * transform.c
    guard determinant != 0 else { return natural }
    let mapped = cellRect.applying(transform.inverted()).intersection(natural)
    return mapped.isNull || mapped.isEmpty ? natural : mapped
  }

  private static func time(fromMs ms: Double) -> CMTime {
    let seconds = ms.isFinite ? max(ms, 0) / 1000 : 0
    return CMTimeMakeWithSeconds(seconds, preferredTimescale: timescale)
  }

  private static func sourceRange(for piece: PieceRecord, in asset: LoadedAsset) -> CMTimeRange {
    let assetRange = CMTimeRange(start: .zero, duration: asset.duration)
    var start = CMTimeClampToRange(time(fromMs: piece.inMs), range: assetRange)
    let end = CMTimeClampToRange(time(fromMs: piece.outMs), range: assetRange)
    var duration = CMTimeSubtract(end, start)
    if duration < frameDuration {
      duration = CMTimeMinimum(frameDuration, asset.duration)
      start = CMTimeMinimum(start, CMTimeSubtract(asset.duration, duration))
    }
    return CMTimeRange(start: start, duration: duration)
  }

  private static func evenRounded(_ value: CGFloat) -> CGFloat {
    let rounded = value.rounded()
    return rounded.truncatingRemainder(dividingBy: 2) == 0 ? rounded : rounded + 1
  }

  private static func layerTransform(for asset: LoadedAsset, renderSize: CGSize) -> CGAffineTransform {
    let oriented = asset.orientedRect
    let orientedSize = asset.orientedSize
    let moveToOrigin = CGAffineTransform(translationX: -oriented.minX, y: -oriented.minY)
    let scale = max(renderSize.width / orientedSize.width, renderSize.height / orientedSize.height)
    let scaled = CGAffineTransform(scaleX: scale, y: scale)
    let centered = CGAffineTransform(
      translationX: (renderSize.width - orientedSize.width * scale) / 2,
      y: (renderSize.height - orientedSize.height * scale) / 2
    )
    return asset.preferredTransform
      .concatenating(moveToOrigin)
      .concatenating(scaled)
      .concatenating(centered)
  }

  private static func transform(for asset: LoadedAsset, crop: CropRecord?, renderSize: CGSize) -> CGAffineTransform {
    let base = layerTransform(for: asset, renderSize: renderSize)
    guard let crop else {
      return base
    }
    let scale = min(max(crop.scale.isFinite ? crop.scale : 1, 1), 3)
    let maxOffset = (scale - 1) / 2
    let x = min(max(crop.x.isFinite ? crop.x : 0, -maxOffset), maxOffset)
    let y = min(max(crop.y.isFinite ? crop.y : 0, -maxOffset), maxOffset)
    let centerX = renderSize.width / 2
    let centerY = renderSize.height / 2
    return base
      .concatenating(CGAffineTransform(translationX: -centerX, y: -centerY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(
        translationX: centerX + x * renderSize.width,
        y: centerY + y * renderSize.height
      ))
  }
}
