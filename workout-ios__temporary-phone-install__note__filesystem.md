# Temporary iPhone installation

This guide installs Workout directly on one or more iPhones for development and
review. It does **not** publish the app, upload it to App Store Connect, or use
TestFlight.

## What this installation is

- A custom Expo development client installed directly from Xcode.
- Temporary and tied to an Apple development signing profile.
- Updated from Metro while the development Mac is running.
- Installed separately on each iPhone.

This project cannot use Expo Go because it includes a custom Expo development
client and native modules.

## Current physical-device limitation

The native app can be built and installed on an iPhone today, but a fresh
physical-device install is not yet fully functional.

The worktree currently gives the app local URLs such as `localhost` and
`127.0.0.1` for Next.js, WorkOS authentication, and Convex. In Simulator those
addresses reach the Mac. On an iPhone they refer to the iPhone itself.

As a result:

- The development client and interface can be installed.
- Metro can usually connect over USB or the local network.
- WorkOS login and Convex-backed data will not work reliably on a newly
  installed phone until the app has a device-accessible preview backend and
  HTTPS authentication callback.
- Expo's Metro tunnel does not solve the API, Convex, or WorkOS callback
  problem by itself.

Do not copy production credentials or point a temporary phone build at
production data to work around this.

## Requirements

- A Mac with Xcode installed.
- The repository dependencies installed with `pnpm install`.
- An Apple ID added to Xcode.
- An iPhone connected to the Mac by USB.
- The iPhone unlocked and set to trust the Mac.
- Developer Mode enabled on the iPhone.

An unpaid Apple Personal Team is sufficient for short-lived local testing, but
its installed app normally expires after several days. A paid Apple Developer
Program membership provides longer-lived development signing and easier device
management, without requiring TestFlight.

## One-time Mac and iPhone setup

1. Connect the iPhone to the Mac by USB and unlock it.
2. Accept **Trust This Computer** on the iPhone if prompted.
3. On the iPhone, open **Settings → Privacy & Security → Developer Mode**.
4. Enable Developer Mode and restart the iPhone when requested.
5. Open Xcode and choose **Xcode → Settings → Accounts**.
6. Add the Apple ID that will sign the temporary build.
7. From the worktree root, open the native workspace:

   ```bash
   open mobile/ios/Workout.xcworkspace
   ```

8. In Xcode, select the **Workout** project and **Workout** target.
9. Open **Signing & Capabilities**.
10. Enable **Automatically manage signing** and select the Apple team.
11. Confirm that the connected iPhone appears as an available run destination.

The current bundle identifier is
`com.isaiahproctor.workout.local`. If Apple reports that it is unavailable for
the selected team, give the development build a unique identifier in
`mobile/app.json`, regenerate the native project, and select the team again.

## Install on an iPhone

Use two terminal windows from the `workout-ios-v1` worktree.

### Terminal 1: start the local backend and web server

```bash
pnpm worktree:start workout-ios-v1
```

Keep this process running. It owns the worktree's local Convex and Next.js
services.

### Terminal 2: build and install the development client

```bash
pnpm ios --device
```

Expo will ask which connected device to use when more than one is available. To
select a device explicitly, use its displayed name:

```bash
pnpm ios --device "Isaiah's iPhone"
```

The first physical-device build may take several minutes because Xcode must
compile, sign, install, and launch the native application.

If iOS asks whether to trust the developer, follow the prompt or open
**Settings → General → VPN & Device Management**, select the developer
certificate, and trust it.

## Normal development after the first install

Keep Terminal 1 running, then start Metro from a second terminal:

```bash
pnpm dev:ios
```

Open Workout on the iPhone and choose the development server shown by the Expo
development client. The Mac and iPhone should be on the same network, and the
Mac firewall must allow Node/Metro connections.

Useful actions:

- Save JavaScript or TypeScript changes to trigger Fast Refresh.
- Press `r` in the Metro terminal to reload the app.
- Re-run `pnpm ios --device` after changing native dependencies, Expo plugins,
  the bundle identifier, entitlements, or other native configuration.

Do not run `pnpm ios` and `pnpm dev:ios` at the same time. Each starts Metro,
and competing Metro processes can leave the installed client connected to the
wrong port.

## Install on another iPhone

For each additional phone:

1. Connect and trust the phone.
2. Enable Developer Mode.
3. Confirm the phone is registered to the selected Apple development team.
4. Run `pnpm ios --device`.
5. Select that phone when Expo asks for a destination.

Each phone must be included in the signing profile. A direct development build
is not a public download and cannot be installed on an unregistered device.

## Stop and remove the temporary setup

Stop Metro with `Ctrl-C`.

Stop the worktree's managed backend and web processes with:

```bash
pnpm worktree:stop workout-ios-v1
```

Delete Workout from the iPhone like any other app when the review is complete.
No App Store or TestFlight cleanup is required.

## Common problems

### Xcode cannot sign the app

- Confirm an Apple ID is present in **Xcode → Settings → Accounts**.
- Select a team under the Workout target's **Signing & Capabilities**.
- Confirm the bundle identifier is unique to that team.
- Keep **Automatically manage signing** enabled for local development.

### The iPhone cannot connect to Metro

- Keep the Mac and iPhone on the same Wi-Fi network.
- Keep `pnpm dev:ios` running.
- Allow Node and Expo through the Mac firewall.
- Disconnect VPNs that isolate local-network traffic.
- Stop duplicate Metro processes and start only one mobile command.
- Reconnect the USB cable and run `pnpm ios --device` again if needed.

### The app opens but login or data does not work

This is the expected current limitation described above. A physical phone
cannot use the Mac's loopback-only Next.js and Convex URLs. The durable fix is a
private device-preview environment with:

- a non-production hosted Convex deployment;
- a stable HTTPS web/API origin;
- a WorkOS Sandbox callback registered for that exact origin;
- mobile configuration generated specifically for the device build; and
- isolated preview data and credentials.

That preview can still be distributed privately through direct/ad hoc
installation. TestFlight and App Store publication are not required.

## First command

After completing the one-time Xcode and iPhone setup, start here:

```bash
pnpm worktree:start workout-ios-v1
```
