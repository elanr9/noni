Pod::Spec.new do |s|
  s.name           = 'ClipJoiner'
  s.version        = '1.0.0'
  s.summary        = 'Concatenates locally recorded video clips into a single mp4.'
  s.description    = 'Local Expo module that joins camera recordings with differing orientations into one portrait mp4 using AVFoundation.'
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
