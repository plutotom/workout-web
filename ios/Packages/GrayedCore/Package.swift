// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GrayedCore",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
        .watchOS(.v11),
    ],
    products: [
        .library(
            name: "GrayedCore",
            targets: ["GrayedCore"]
        ),
    ],
    targets: [
        .target(
            name: "GrayedCore",
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
        .testTarget(
            name: "GrayedCoreTests",
            dependencies: ["GrayedCore"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
