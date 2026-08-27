Pod::Spec.new do |s|
  s.name           = 'WatchBridge'
  s.version        = '0.1.0'
  s.summary        = 'WatchConnectivity and HealthKit startWatchApp bridge'
  s.description    = 'Starts the companion Watch app and mirrors live workout metrics to iPhone.'
  s.license        = 'MIT'
  s.author         = 'Workout'
  s.homepage       = 'https://github.com/plutotom/workout-web'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/plutotom/workout-web.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'HealthKit', 'WatchConnectivity'
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
