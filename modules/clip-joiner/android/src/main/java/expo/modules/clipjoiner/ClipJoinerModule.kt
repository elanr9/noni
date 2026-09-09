package expo.modules.clipjoiner

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class ClipJoinException(message: String) : CodedException("ERR_CLIP_JOIN", message, null)

@OptIn(UnstableApi::class)
class ClipJoinerModule : Module() {
  private val activeTransformers = mutableSetOf<Transformer>()

  override fun definition() = ModuleDefinition {
    Name("ClipJoiner")

    AsyncFunction("joinClips") { uris: List<String>, promise: Promise ->
      joinClips(uris, promise)
    }.runOnQueue(Queues.MAIN)
  }

  private fun toUri(raw: String): Uri {
    if (raw.startsWith("file://") || raw.startsWith("content://")) {
      return Uri.parse(raw)
    }
    return Uri.fromFile(File(raw))
  }

  private fun joinClips(uris: List<String>, promise: Promise) {
    if (uris.isEmpty()) {
      promise.reject(ClipJoinException("No clips were provided"))
      return
    }

    val context = appContext.reactContext ?: run {
      promise.reject(Exceptions.ReactContextLost())
      return
    }

    val outputFile = File(context.cacheDir, "clip-join-${UUID.randomUUID()}.mp4")

    val editedItems = uris.map { EditedMediaItem.Builder(MediaItem.fromUri(toUri(it))).build() }
    val sequence = EditedMediaItemSequence.Builder(editedItems).build()
    val composition = Composition.Builder(sequence).build()

    var transformer: Transformer? = null
    val listener = object : Transformer.Listener {
      override fun onCompleted(composition: Composition, exportResult: ExportResult) {
        transformer?.let { activeTransformers.remove(it) }
        promise.resolve(Uri.fromFile(outputFile).toString())
      }

      override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
        transformer?.let { activeTransformers.remove(it) }
        outputFile.delete()
        promise.reject(ClipJoinException(exportException.message ?: "Unknown export error"))
      }
    }

    val built = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .addListener(listener)
      .build()
    transformer = built
    activeTransformers.add(built)

    try {
      built.start(composition, outputFile.absolutePath)
    } catch (e: Exception) {
      activeTransformers.remove(built)
      outputFile.delete()
      promise.reject(ClipJoinException(e.message ?: "Could not start export"))
    }
  }
}
