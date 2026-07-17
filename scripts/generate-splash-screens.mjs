import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = process.argv[2] ?? resolve(root, "scripts/splash-base.png");
const outDir = resolve(root, "public/splash");

const splashScreens = [
  { width: 1320, height: 2868, name: "iphone-16-pro-max" },
  { width: 1206, height: 2622, name: "iphone-16-pro" },
  { width: 1179, height: 2556, name: "iphone-16" },
  { width: 1290, height: 2796, name: "iphone-15-pro-max" },
  { width: 1170, height: 2532, name: "iphone-14-15" },
  { width: 1125, height: 2436, name: "iphone-x" },
  { width: 1242, height: 2688, name: "iphone-xs-max" },
  { width: 828, height: 1792, name: "iphone-xr" },
  { width: 750, height: 1334, name: "iphone-se" },
  { width: 2048, height: 2732, name: "ipad-pro-12" },
  { width: 1668, height: 2388, name: "ipad-pro-11" },
  { width: 1536, height: 2048, name: "ipad" },
];

await mkdir(outDir, { recursive: true });
await copyFile(source, resolve(root, "scripts/splash-base.png"));

for (const screen of splashScreens) {
  const filename = `apple-splash-${screen.width}x${screen.height}.png`;
  await sharp(source)
    .resize(screen.width, screen.height, {
      fit: "cover",
      position: "centre",
    })
    .png()
    .toFile(resolve(outDir, filename));
  console.log(`✓ ${filename}`);
}

console.log(
  `Generated ${splashScreens.length} splash screens in public/splash/`,
);
