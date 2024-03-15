// observers.js
// This module exports mutation observer and image processing logic.
import { disableVideo, enableVideo, isImageTooSmall, listenToEvent, processNode, updateBGvideoStatus } from "./helpers.js";

import { applyBlurryStart } from "./style.js";
import { processImage, processVideo } from "./processing2.js";
import { STATUSES } from "../constants.js";
let mutationObserver, _settings;
let videosInProcess = [];
let videoPort;

const startObserving = () => {
	if (!mutationObserver) initMutationObserver();

	mutationObserver?.observe(document, {
		childList: true,
		characterData: false,
		subtree: true,
		attributes: true,
		attributeFilter: ["src"],
	});
};

const initMutationObserver = (_videoPort) => {
	videoPort = _videoPort;
	// if (mutationObserver) mutationObserver.disconnect();
	mutationObserver = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === "childList") {
				mutation.addedNodes.forEach((node) => {
					processNode(node, (node) => {
						observeNode(node, false);
					});
				});
			} else if (mutation.type === "attributes") {
				// if the src attribute of an image or video changes, process it
				const node = mutation.target;
				observeNode(node, mutation?.attributeName === "src");
			}
		});
	});
	startObserving();
};

const attachObserversListener = () => {
	listenToEvent("settingsLoaded", ({ detail: settings }) => {
		_settings = settings;
		if (!_settings.shouldDetect()) {
			mutationObserver?.disconnect();
			mutationObserver = null;
		} else {
			// if observing isn't already started, start it
			if (!mutationObserver) startObserving();
		}
	});
	listenToEvent("toggleOnOffStatus", () => {
		// console.log("HB== Observers Listener", _settings.shouldDetect());
		if (!_settings?.shouldDetect()) {
			// console.log("HB== Observers Listener", "disconnecting");
			mutationObserver?.disconnect();
			mutationObserver = null;
		} else {
			// if observing isn't already started, start it
			if (!mutationObserver) startObserving();
		}
	});

	// listen to message from background to tab
	browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.type === "disable-detection") {
			videosInProcess
				.filter(
					// filter videos that are playing, not disabled and in process
					(video) =>
						video.dataset.HBstatus === STATUSES.PROCESSING &&
						!video.paused &&
						video.currentTime > 0
				)
				.forEach((video) => {
					disableVideo(video);
				
				});
			} else if (request.type === "enable-detection") {
				videosInProcess
				.filter(
					(video) =>
					video.dataset.HBstatus === STATUSES.DISABLED &&
					!video.paused &&
					video.currentTime > 0
					)
					.forEach((video) => {
						enableVideo(video);
				});
		}
	});
};

function observeNode(node, srcAttribute) {
	if (
		!(
			(node.tagName === "IMG" &&
				(_settings ? _settings.shouldDetectImages() : true)) ||
			(node.tagName === "VIDEO" &&
				(_settings ? _settings.shouldDetectVideos() : true))
		)
	)
		return;

	let sourceChildren = node.tagName === "VIDEO" ? node.getElementsByTagName("source")?.length : 0; //some videos have source instead of src attribute
	const conditions =
		(srcAttribute || !node.dataset.HBstatus) &&
		(node.src?.length > 0 || sourceChildren > 0) &&
		(!isImageTooSmall(node) || node.height === 0 || node.width === 0); //

	if (!conditions) {
		return;
	}

	applyBlurryStart(node);

	node.dataset.HBstatus = STATUSES.OBSERVED;
	if (node.src?.length || sourceChildren > 0) {
		// if there's no src attribute yet, wait for the mutation observer to catch it
		if (node.tagName === "IMG") processImage(node, STATUSES);
		else if (node.tagName === "VIDEO") {
			processVideo(node, STATUSES, videoPort);
			videosInProcess.push(node);
			updateBGvideoStatus(videosInProcess);
		}
	} else {
		// remove the HBstatus if the node has no src attribute
		delete node.dataset?.HBstatus;
	}
}

export { attachObserversListener, initMutationObserver, STATUSES };
