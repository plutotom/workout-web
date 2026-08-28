Pod::Spec.new do |s|
  s.name           = 'AppleFoundationModels'
  s.version        = '0.1.0'
  s.summary        = 'Apple Intelligence on-device and Private Cloud Compute'
  s.description    = 'Structured workout drafts via Foundation Models (on-device) with PCC overflow when the 4k window is too small.'
  s.license        = 'MIT'
  s.author         = 'Workout'
  s.homepage       = 'https://github.com/plutotom/workout-web'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/plutotom/workout-web.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'FoundationModels'
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
