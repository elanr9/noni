Pod::Spec.new do |s|
  s.name           = 'VideoEditor'
  s.version        = '1.0.0'
  s.summary        = 'Live preview and mp4 export for the creator video editor.'
  s.description    = 'Local Expo module that renders a trimmed, cropped, speed adjusted timeline of clips through one shared AVFoundation composition for both the on screen preview and the exported mp4.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'MIT' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
