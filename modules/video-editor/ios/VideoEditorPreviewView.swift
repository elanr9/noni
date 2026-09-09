import AVFoundation
import ExpoModulesCore
import UIKit

private struct SeekRequest {
  let positionMs: Double
  let precise: Bool
}

final class VideoEditorPreviewView: ExpoView {
  let onTime = EventDispatcher()
  let onReady = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()

  private let player = AVPlayer()
  private let playerLayer = AVPlayerLayer()
  private let cache = AssetCache()

  private var generation = 0
  private var durationMs: Double = 0
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var backgroundObserver: NSObjectProtocol?

  private var seekInFlight = false
  private var seekToken = 0
  private var pendingSeek: SeekRequest?

  private static var audioSessionActivated = false

  var playing: Bool = false {
    didSet {
      onMain { [weak self] in self?.applyPlaying() }
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true

    player.actionAtItemEnd = .pause
    player.automaticallyWaitsToMinimizeStalling = false

    playerLayer.player = player
    playerLayer.videoGravity = .resizeAspectFill
    playerLayer.backgroundColor = UIColor.black.cgColor
    layer.addSublayer(playerLayer)

    installTimeObserver()
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.player.pause()
    }
  }

  deinit {
    if let timeObserver {
      player.removeTimeObserver(timeObserver)
    }
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    if let backgroundObserver {
      NotificationCenter.default.removeObserver(backgroundObserver)
    }
    player.pause()
    player.replaceCurrentItem(with: nil)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    playerLayer.frame = bounds
    CATransaction.commit()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      player.pause()
    }
  }

  // MARK: Timeline

  func setTimeline(_ timeline: TimelineRecord) {
    onMain { [weak self] in
      guard let self else { return }
      self.generation += 1
      let myGeneration = self.generation

      if timeline.pieces.isEmpty {
        self.clearItem()
        self.onReady(["durationMs": 0])
        return
      }

      let cache = self.cache
      Task.detached(priority: .userInitiated) { [weak self] in
        do {
          let built = try await CompositionBuilder.build(timeline: timeline, cache: cache)
          DispatchQueue.main.async { [weak self] in
            guard let self, self.generation == myGeneration else { return }
            self.install(built)
          }
        } catch {
          let message = videoEditorErrorMessage(error)
          DispatchQueue.main.async { [weak self] in
            guard let self, self.generation == myGeneration else { return }
            self.onError(["message": message])
          }
        }
      }
    }
  }

  private func install(_ built: BuiltTimeline) {
    let previous = player.currentTime()
    let previousMs = previous.isNumeric ? max(previous.seconds, 0) * 1000 : 0

    let item = AVPlayerItem(asset: built.composition)
    item.videoComposition = built.videoComposition
    durationMs = built.durationMs

    observeEnd(of: item)
    player.replaceCurrentItem(with: item)

    // Any seek still in flight targeted the old item; drop its completion.
    seekToken += 1
    seekInFlight = false
    pendingSeek = SeekRequest(positionMs: min(previousMs, durationMs), precise: true)
    flushPendingSeek()

    onReady(["durationMs": durationMs])
    emitTime()
    if playing {
      player.play()
    }
  }

  private func clearItem() {
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
      self.endObserver = nil
    }
    player.pause()
    player.replaceCurrentItem(with: nil)
    durationMs = 0
    seekToken += 1
    seekInFlight = false
    pendingSeek = nil
  }

  private func observeEnd(of item: AVPlayerItem) {
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      guard let self else { return }
      self.player.pause()
      self.onTime(["positionMs": self.durationMs])
      self.onEnd([:])
    }
  }

  // MARK: Playback

  private func applyPlaying() {
    guard playing else {
      player.pause()
      return
    }
    guard let item = player.currentItem else { return }

    let duration = item.duration
    let current = player.currentTime()
    if duration.isNumeric, current.isNumeric, current >= duration {
      pendingSeek = SeekRequest(positionMs: 0, precise: true)
      flushPendingSeek()
    }
    Self.activateAudioSession()
    player.play()
  }

  private static func activateAudioSession() {
    guard !audioSessionActivated else { return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default)
      try session.setActive(true)
      audioSessionActivated = true
    } catch {
      // Playback still works without the session; audio may just follow the silent switch.
    }
  }

  private func installTimeObserver() {
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(value: 1, timescale: 30),
      queue: .main
    ) { [weak self] time in
      guard let self, self.player.currentItem != nil else { return }
      self.onTime(["positionMs": time.seconds * 1000])
    }
  }

  private func emitTime() {
    let current = player.currentTime()
    guard current.isNumeric else { return }
    onTime(["positionMs": current.seconds * 1000])
  }

  // MARK: Seeking

  func seek(toMs positionMs: Double, precise: Bool) {
    onMain { [weak self] in
      guard let self else { return }
      self.pendingSeek = SeekRequest(positionMs: positionMs, precise: precise)
      self.flushPendingSeek()
    }
  }

  private func flushPendingSeek() {
    guard !seekInFlight, let request = pendingSeek else { return }
    pendingSeek = nil
    guard let item = player.currentItem else { return }

    let seconds = request.positionMs.isFinite ? max(request.positionMs, 0) / 1000 : 0
    var target = CMTime(seconds: seconds, preferredTimescale: 600)
    let duration = item.duration
    if duration.isNumeric {
      target = CMTimeMinimum(target, duration)
    }
    let tolerance = request.precise ? CMTime.zero : CMTime(seconds: 0.1, preferredTimescale: 600)

    seekToken += 1
    let token = seekToken
    seekInFlight = true
    player.seek(to: target, toleranceBefore: tolerance, toleranceAfter: tolerance) { [weak self] _ in
      DispatchQueue.main.async { [weak self] in
        guard let self, self.seekToken == token else { return }
        self.seekInFlight = false
        self.emitTime()
        self.flushPendingSeek()
      }
    }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }
}
