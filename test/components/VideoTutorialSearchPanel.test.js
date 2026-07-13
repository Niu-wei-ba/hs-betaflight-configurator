import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, nextTick } from "vue";
import { VIDEO_TUTORIAL_SEARCH_EVENT, getVideoTutorialCatalog } from "../../src/js/video_tutorials";

const CONTENT_READY_EVENT = "video-tutorial-search:content-ready";
const seededVideos = structuredClone(getVideoTutorialCatalog().videos);

describe("VideoTutorialSearchPanel", () => {
    let catalog;
    let app;
    let mount;

    beforeEach(async () => {
        document.body.innerHTML = `
            <div id="tab-content-container">
                <div id="tabs"><ul><li class="tab_options active"><a href="#">设置</a></li></ul></div>
                <div class="tab_container"></div>
                <div id="content"><div class="content_wrapper"><div class="tab_title">设置</div></div></div>
                <div id="global-search-root"></div>
            </div>
        `;
        catalog = getVideoTutorialCatalog();
        catalog.videos.splice(0, catalog.videos.length, ...structuredClone(seededVideos));
        const { default: VideoTutorialSearchPanel } = await import("../../src/components/VideoTutorialSearchPanel.vue");
        mount = document.getElementById("global-search-root");
        app = createApp(VideoTutorialSearchPanel);
        app.mount(mount);
        await nextTick();
    });

    afterEach(() => {
        app?.unmount();
        catalog?.videos.splice(0, catalog.videos.length, ...structuredClone(seededVideos));
        document.body.innerHTML = "";
    });

    function searchForm() {
        return document.querySelector(".video-tutorial-search-entry");
    }

    async function submitSearch(query) {
        const form = searchForm();
        const input = form.querySelector("input");
        input.value = query;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await nextTick();
    }

    it("mounts after a standard title without duplicates and submits through Enter or the button form", async () => {
        expect(searchForm()).not.toBeNull();
        document.dispatchEvent(new CustomEvent(CONTENT_READY_EVENT));
        expect(document.querySelectorAll(".video-tutorial-search-entry")).toHaveLength(1);

        const form = searchForm();
        const input = form.querySelector("input");
        input.value = "接收机";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        form.querySelector("button").click();
        await nextTick();

        expect(document.getElementById("tab-content-container").classList).toContain("video-tutorial-search-open");
        expect(document.querySelector(".video-tutorial-search-panel")).not.toBeNull();
        const firstResult = document.querySelector(".video-tutorial-search-result");
        expect(firstResult.textContent).toContain("接收机");

        const description = firstResult.querySelector(".video-tutorial-search-result__description");
        expect(description.parentElement).toBe(firstResult);

        const thumbnail = document.querySelector(".video-tutorial-search-result__thumbnail");
        expect(thumbnail.getAttribute("referrerpolicy")).toBe("no-referrer");
        thumbnail.dispatchEvent(new Event("error"));
        await nextTick();
        expect(document.querySelector(".video-tutorial-search-result__thumbnail--empty")).not.toBeNull();

        document.querySelector(".video-tutorial-search-panel__close").click();
        await submitSearch("图传");
        expect(document.querySelector(".video-tutorial-search-panel")).not.toBeNull();
    });

    it.each(["landing", "privacy_policy", "help"])("does not add a search box to the %s tab", async (tab) => {
        const activeTab = document.querySelector("#tabs li.active");
        activeTab.className = `tab_${tab} active`;
        document.getElementById("content").innerHTML = '<div class="content_wrapper"><h1>页面标题</h1></div>';
        document.dispatchEvent(new CustomEvent(CONTENT_READY_EVENT));
        await nextTick();

        expect(searchForm()).toBeNull();
        expect(document.querySelector(".video-tutorial-search-panel")).toBeNull();
        expect(document.getElementById("tab-content-container").classList).not.toContain("video-tutorial-search-open");
    });

    it("keeps a search box on the video tutorial page and searches within that page", async () => {
        let receivedQuery = null;
        document.addEventListener(
            VIDEO_TUTORIAL_SEARCH_EVENT,
            (event) => {
                receivedQuery = event.detail?.query;
                event.preventDefault();
            },
            { once: true },
        );
        document.querySelector("#tabs li.active").className = "tab_video_tutorials active";
        document.getElementById("content").innerHTML = `
            <section class="video-tutorials-page"><header><h1>视频教程</h1></header></section>
        `;
        document.dispatchEvent(new CustomEvent(CONTENT_READY_EVENT));
        await nextTick();

        expect(searchForm()).not.toBeNull();
        await submitSearch(" osd ");

        expect(receivedQuery).toBe("osd");
        expect(document.querySelector(".video-tutorial-search-panel")).toBeNull();
        expect(document.getElementById("tab-content-container").classList).not.toContain("video-tutorial-search-open");
    });

    it("uses a fallback title row when the page has no standard title", async () => {
        document.getElementById("content").innerHTML = '<div class="content_wrapper"><p>没有顶级标题。</p></div>';
        document.dispatchEvent(new CustomEvent(CONTENT_READY_EVENT));
        await nextTick();

        expect(document.querySelector(".video-tutorial-search-fallback")).not.toBeNull();
        expect(searchForm()).not.toBeNull();
    });

    it("does not open for empty input and remains closed after typing until the next explicit submit", async () => {
        await submitSearch("   ");
        expect(document.querySelector(".video-tutorial-search-panel")).toBeNull();

        await submitSearch("接收机");
        document.querySelector(".video-tutorial-search-panel__close").click();
        await nextTick();

        expect(document.querySelector(".video-tutorial-search-panel")).toBeNull();
        const input = searchForm().querySelector("input");
        input.value = "图传";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await nextTick();
        expect(document.querySelector(".video-tutorial-search-panel")).toBeNull();
    });

    it("plays results in the panel, returns to results, and falls back to the source link after an iframe error", async () => {
        const sample = catalog.videos.find((video) => video.embedUrl && video.sourceUrl && video.authorName);
        await submitSearch(sample.tags[0]);

        const result = [...document.querySelectorAll(".video-tutorial-search-result")].find((button) =>
            button.textContent.includes(sample.title),
        );
        expect(result.textContent).toContain(sample.authorName);
        expect(result.querySelector(".video-tutorial-search-result__author img").getAttribute("referrerpolicy")).toBe(
            "no-referrer",
        );
        result.click();
        await nextTick();

        expect(document.querySelector(".video-tutorial-search-panel__author").textContent).toContain(sample.authorName);
        const iframe = document.querySelector(".video-tutorial-search-panel__player iframe");
        expect(iframe).not.toBeNull();
        expect(iframe.getAttribute("src")).toContain("autoplay=0");
        iframe.dispatchEvent(new Event("error"));
        await nextTick();

        const fallback = document.querySelector(".video-tutorial-search-panel__embed-fallback");
        expect(fallback).not.toBeNull();
        expect(fallback.querySelector("a").getAttribute("href")).toBe(sample.sourceUrl);

        document.querySelector(".video-tutorial-search-panel__back").click();
        await nextTick();
        expect(document.querySelector(".video-tutorial-search-panel__results")).not.toBeNull();
    });
});
