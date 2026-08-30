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

  # FoundationModels (and Expo SwiftUI modules) autolink private SwiftUICore /
  # UIUtilities into the RN debug dylib. Apps are not allowable clients of those
  # frameworks → `cannot link directly with 'SwiftUICore'`. Ignore the autolink
  # on the *app* target; the public SwiftUI / FoundationModels APIs still work.
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => '$(inherited) -Wl,-ignore_auto_link_library,SwiftUICore -Wl,-ignore_auto_link_library,UIUtilities',
  }

  # PrivateCloudComputeLanguageModel exists only in the iOS 27 SDK (Xcode 27).
  # Runtime `#available(iOS 27)` does not hide the type at compile time — Xcode 26
  # fails with "cannot find PrivateCloudComputeLanguageModel in scope" and then
  # logged-out / Free on-device generate never links. Define WORKOUT_APPLE_PCC
  # only when compiling against that SDK (or WORKOUT_APPLE_PCC=1 at pod install).
  pcc_flag = '$(inherited) -D WORKOUT_APPLE_PCC'
  xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'OTHER_SWIFT_FLAGS[sdk=iphoneos27*]' => pcc_flag,
    'OTHER_SWIFT_FLAGS[sdk=iphonesimulator27*]' => pcc_flag,
    'OTHER_SWIFT_FLAGS[sdk=iphoneos28*]' => pcc_flag,
    'OTHER_SWIFT_FLAGS[sdk=iphonesimulator28*]' => pcc_flag,
  }
  xcconfig['OTHER_SWIFT_FLAGS'] = pcc_flag if ENV['WORKOUT_APPLE_PCC'] == '1'
  s.pod_target_xcconfig = xcconfig
end
