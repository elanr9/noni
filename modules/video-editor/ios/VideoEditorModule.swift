import AVFoundation
import ExpoModulesCore
import UIKit

struct CropRecord: Record {
  @Field var scale: Double = 1
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct PieceRecord: Record {
  @Field var uri: String = ""
  @Field var inMs: Double = 0
  @Field var outMs: Double = 0
  @Field var speed: Double = 1
  @Field var muted: Bool = false
  @Field var crop: CropRecord? = nil
}

struct TimelineRecord: Record {
  @Field var pieces: [PieceRecord] = []
}

internal func videoEditorCacheUrl(fileName: String) -> URL {
  let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    ?? URL(fileURLWithPath: NSTemporaryDirectory())
  return directory.appendingPathComponent(fileName)
}

private final class ThumbnailBatch {
  var results: [String]
  var index = 0
  var lastSuccess = ""

  init(count: Int) {
    results = Array(repeating: "", count: count)
  }
}

private actor ExportCoordinator {
  private let cache = AssetCache()
  private var session: AVAssetExportSession?
  private var pending: Promise?
  private var generation = 0

  func start(timeline: TimelineRecord, promise: Promise) async {
    cancel()
    generation += 1
    let myGeneration = generation
    pending = promise

    let outputUrl = videoEditorCacheUrl(fileName: "video-editor-\(UUID().uuidString).mp4")
    do {
      let built = try await CompositionBuilder.build(timeline: timeline, cache: cache)
      guard myGeneration == generation else { return }

      guard let exportSession = AVAssetExportSession(
        asset: built.composition,
        presetName: AVAssetExportPresetHighestQuality
      ) else {
        throw VideoEditorException("Could not create export session")
      }
      exportSession.outputURL = outputUrl
      exportSession.outputFileType = .mp4
      exportSession.shouldOptimizeForNetworkUse = true
      exportSession.videoComposition = built.videoComposition
      session = exportSession

      await exportSession.export()
      guard myGeneration == generation else { return }
      session = nil
      pending = nil

      switch exportSession.status {
      case .completed:
        promise.resolve(["uri": outputUrl.absoluteString, "durationMs": built.durationMs])
      case .cancelled:
        try? FileManager.default.removeItem(at: outputUrl)
        promise.reject(VideoEditorException("Export was cancelled"))
      default:
        try? FileManager.default.removeItem(at: outputUrl)
        promise.reject(VideoEditorException(
          exportSession.error?.localizedDescription ?? "Unknown export error"
        ))
      }
    } catch {
      guard myGeneration == generation else { return }
      session = nil
      pending = nil
      promise.reject(VideoEditorException(videoEditorErrorMessage(error)))
    }
  }

  func cancel() {
    guard pending != nil || session != nil else { return }
    generation += 1
    session?.cancelExport()
    session = nil
    pending?.reject(VideoEditorException("Export was cancelled"))
    pending = nil
  }
}

public class VideoEditorModule: Module {
  private let exporter = ExportCoordinator()

  public func definition() -> ModuleDefinition {
    Name("VideoEditor")

    AsyncFunction("exportTimeline") { (timeline: TimelineRecord, promise: Promise) in
      Task {
        await self.exporter.start(timeline: timeline, promise: promise)
      }
    }

    AsyncFunction("cancelExport") { (promise: Promise) in
      Task {
        await self.exporter.cancel()
        promise.resolve()
      }
    }

    AsyncFunction("thumbnails") { (uri: String, timesMs: [Double], height: Double, promise: Promise) in
      Task {
        do {
          let uris = try await Self.thumbnails(uri: uri, timesMs: timesMs, height: height)
          promise.resolve(uris)
        } catch let exception as Exception {
          promise.reject(exception)
        } catch {
          promise.reject(VideoEditorException(error.localizedDescription))
        }
      }
    }

    View(VideoEditorPreviewView.self) {
      Events("onTime", "onReady", "onEnd", "onError")

      Prop("timeline") { (view: VideoEditorPreviewView, timeline: TimelineRecord) in
        view.setTimeline(timeline)
      }

      Prop("playing") { (view: VideoEditorPreviewView, playing: Bool) in
        view.playing = playing
      }

      AsyncFunction("seekTo") { (view: VideoEditorPreviewView, positionMs: Double, precise: Bool) in
        view.seek(toMs: positionMs, precise: precise)
      }
    }
  }

  private static func thumbnails(uri: String, timesMs: [Double], height: Double) async throws -> [String] {
    guard !timesMs.isEmpty else { return [] }
    let asset = AVURLAsset(url: try AssetCache.url(from: uri))
    let duration = try await asset.load(.duration)
    let durationSeconds = duration.isNumeric ? max(duration.seconds, 0) : 0
    let maxHeight = height.isFinite && height > 0 ? height : 120

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: maxHeight * 4, height: maxHeight)
    let tolerance = CMTime(seconds: 0.25, preferredTimescale: 600)
    generator.requestedTimeToleranceBefore = tolerance
    generator.requestedTimeToleranceAfter = tolerance

    let times: [NSValue] = timesMs.map { ms in
      let seconds = ms.isFinite ? min(max(ms / 1000, 0), durationSeconds) : 0
      return NSValue(time: CMTime(seconds: seconds, preferredTimescale: 600))
    }
    let batchId = UUID().uuidString

    let batch = ThumbnailBatch(count: times.count)
    return await withCheckedContinuation { continuation in
      // The generator invokes this handler serially, in request order.
      generator.generateCGImagesAsynchronously(forTimes: times) { _, image, _, result, _ in
        guard batch.index < batch.results.count else { return }
        if result == .succeeded, let image {
          let url = videoEditorCacheUrl(fileName: "video-editor-thumb-\(batchId)-\(batch.index).jpg")
          if writeJpeg(image, to: url) {
            batch.lastSuccess = url.absoluteString
          }
        }
        batch.results[batch.index] = batch.lastSuccess
        batch.index += 1
        if batch.index == batch.results.count {
          continuation.resume(returning: batch.results)
        }
      }
    }
  }

  private static func writeJpeg(_ image: CGImage, to url: URL) -> Bool {
    guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.7) else {
      return false
    }
    return (try? data.write(to: url, options: .atomic)) != nil
  }
}
