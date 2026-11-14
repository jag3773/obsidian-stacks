// Installs the pinned UiAutomator2 driver for the Android end-to-end tests
// (npm run test:e2e:android:deps). Appium only finds drivers installed with
// `appium driver install`, into its home folder. This uses the project's own folder,
// .appium/, so a driver in a developer's shared ~/.appium is never used or changed;
// set APPIUM_HOME to choose another. wdio.android.conf.mts uses the same default.
// A driver of any other version is replaced with the pinned one.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const DRIVER = "uiautomator2";
const PACKAGE = "appium-uiautomator2-driver";
const VERSION = "8.7.3";

process.env.APPIUM_HOME ||= resolve(".appium");
const appium = (...args) => execFileSync(resolve("node_modules/.bin/appium"), args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const installed = () => JSON.parse(appium("driver", "list", "--installed", "--json"))[DRIVER]?.version;

const before = installed();
if (before === VERSION) {
	console.log(`${DRIVER}@${VERSION} is already installed in ${process.env.APPIUM_HOME}.`);
} else {
	if (before) {
		console.log(`Replacing ${DRIVER}@${before} with ${VERSION} in ${process.env.APPIUM_HOME}.`);
		appium("driver", "uninstall", DRIVER);
	}
	appium("driver", "install", "--source=npm", `${PACKAGE}@${VERSION}`);
	const after = installed();
	if (after !== VERSION) {
		console.error(`Expected ${DRIVER}@${VERSION} after installing, found ${after ?? "none"}.`);
		process.exit(1);
	}
	console.log(`Installed ${DRIVER}@${VERSION} in ${process.env.APPIUM_HOME}.`);
}
