import ExpoModulesCore

/// Register before React/JavaScript starts, including background mirror launches.
public class WatchBridgeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    WatchPhoneSession.shared.bootstrap()
    return true
  }
}
