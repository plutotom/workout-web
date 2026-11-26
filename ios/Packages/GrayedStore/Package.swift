// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GrayedStore",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
        .watchOS(.v11),
    ],
    products: [
        .library(
            name: "GrayedStore",
            targets: ["GrayedStore"]
        ),
    ],
    dependencies: [
        .package(path: "../GrayedCore"),
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.12.0"),
    ],
    targets: [
        .target(
            name: "GrayedStore",
            dependencies: [
                .product(name: "GrayedCore", package: "GrayedCore"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
        .testTarget(
            name: "GrayedStoreTests",
            dependencies: [
                "GrayedStore",
                .product(name: "GrayedCore", package: "GrayedCore"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            resources: [
                .copy("Fixtures"),
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
    ]
)
