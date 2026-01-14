/*
    ESP32 Pinouts - Fast Reference Tool

    Data model goals:
    - No required fields (missing image/docs/notes should never crash the UI).
    - Supports single image OR multi-image boards.
    - Supports as much "root truth" sources as you want.
    - UI chooses "best" doc automatically (datasheet > TRM > schematic > guidelines > reference).

    Each item supports:
      {
        id: "unique-id",
        title: "Name",
        family: "ESP32 | ESP32-C3 | ESP32-S3 | ESP32-WROOM | ...",
        badge: "short label (optional)",
        tags: ["..."],
        notes: "optional text",

        // Preferred:
        images: [
          { src: "../img/esp32/pinouts/foo.png", alt: "desc", label: "Front" },
          { src: "../img/esp32/pinouts/foo2.png", alt: "desc", label: "Back" }
        ],

        // Back-compat:
        image: "../img/esp32/pinouts/foo.png",
        alt: "desc",

        docs: [
          { type: "datasheet" | "trm" | "schematic" | "guidelines" | "reference", label: "text", url: "https://..." }
        ]
      }
*/

const PINOUTS = [
    {
        id: "esp32-generic",
        title: "ESP32 (Generic)",
        family: "ESP32",
        badge: "GEN",
        tags: ["datasheet", "trm", "gpio", "adc", "spi", "i2c", "uart"],
        image: "../img/esp32/pinouts/esp32-devkitC-v4-pinout.png",
        alt: "ESP32 generic pinout diagram",
        notes: "Generic ESP32 pinout reference. Always confirm strap pins, ADC limitations, and USB/UART wiring against your board and the datasheet/TRM. Cheap Aliexpress typical",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "guidelines", label: "ESP32 Hardware Design Guidelines (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_hardware_design_guidelines_en.pdf" }
        ]
    },
    {
        id: "esp32-c3",
        title: "ESP32-C3",
        family: "ESP32-C3",
        badge: "C3",
        tags: ["risc-v", "usb", "low-power", "i2c", "spi", "uart"],
        image: "../img/esp32/pinouts/esp32-c3-devkitc-02-v1-pinout.png",
        alt: "ESP32-C3 pinout diagram",
        notes: "C3 is RISC-V based and often includes native USB-Serial/JTAG. Great for small WiFi+BLE designs. Check GPIO capabilities and strapping pins in the datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32-C3 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf" },
            { type: "trm", label: "ESP32-C3 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-c3_technical_reference_manual_en.pdf" },
            { type: "guidelines", label: "ESP32-C3 Hardware Design Guidelines (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-c3_hardware_design_guidelines_en.pdf" },
            { type: "schematic", label: "ESP32-C3-DevKitM-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-C3-DEVKITM-1_V1_20200915A.pdf" }
        ]
    },
    {
        id: "esp32-s3",
        title: "ESP32-S3",
        family: "ESP32-S3",
        badge: "S3",
        tags: ["psram", "usb", "ai", "vector", "lcd", "camera"],
        image: "../img/esp32/pinouts/ESP32-S3_DevKitC-1_pinlayout_v1.1.jpg",
        alt: "ESP32-S3 pinout diagram",
        notes: "S3 introduces different peripheral set and pin mux. TRM is often the fastest path to answer \"can pin X do Y?\" questions.",
        docs: [
            { type: "datasheet", label: "ESP32-S3 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf" },
            { type: "trm", label: "ESP32-S3 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-s3_technical_reference_manual_en.pdf" },
            { type: "guidelines", label: "ESP32-S3 Hardware Design Guidelines (Espressif)", url: "https://espressif.com/sites/default/files/documentation/esp32-s3_hardware_design_guidelines_en.pdf" },
            { type: "schematic", label: "ESP32-S3-DevKitC-1 V1.1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-S3-DevKitC-1_V1.1_20220413.pdf" }
        ]
    },
    {
        id: "esp32-cyd",
        title: "ESP32-CYD LVGL 2.8in (Varies)",
        family: "ESP32",
        badge: "CYD",
        tags: ["display", "touch", "sd-card", "maker-store", "cyd", "TFT"],
        images: [
            {
                src: "../img/esp32/pinouts/Maker-Store-CYD.png",
                alt: "CYD pinout Maker-Store",
                label: "Pinout"
            },
            {
                src: "../img/esp32/pinouts/FreeNove.png",
                alt: "CYD pinout FreeNove",
                label: "Pinout"
            },
            {
                src: "../img/esp32/pinouts/FreeNove-Pinout.png",
                alt: "FreeNove GPIO",
                label: "GPIO"
            }
        ],
        notes: "CYD (Cheap Yellow Display) is a nickname for multiple similar ESP32 display boards. Pin usage (TFT, touch, SD, LED, audio) can vary by revision/manufacturer. Treat any single pinout as probable unless verified against your exact board's schematic/repo.",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "reference", label: "CYD Community Repo (witnessmenow)", url: "https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display" },
            { type: "reference", label: "CYD Pinout Guide (Random Nerd Tutorials)", url: "https://randomnerdtutorials.com/esp32-cheap-yellow-display-cyd-pinout-esp32-2432s028r/" },
            { type: "reference", label: "CYD Pinout FreeNove", url: "https://docs.freenove.com/projects/fnk0104/en/latest/fnk0104/codes/MAIN/Preface.html" },
            { type: "schematic", label: "ESP32-2432S028 PCB/Schematic PDF (macsbug) [variant-dependent]", url: "https://macsbug.wordpress.com/wp-content/uploads/2022/08/esp32_2432s028_pcb.pdf" }
        ]
    },
    {
        id: "esp32-s2",
        title: "ESP32-S2 (Native USB)",
        family: "ESP32-S2",
        badge: "S2",
        tags: ["usb-otg", "native-usb", "single-core", "wifi", "no-ble", "touch", "adc", "spi", "i2c", "uart"],
        image: "../img/esp32/pinouts/esp32-s2-devkitc-1-pinout.png",
        alt: "ESP32-S2-DevKitC-1 pinout diagram",
        notes: "S2 is single-core Xtensa LX7 at 240MHz with NATIVE USB 2.0 OTG (Device/Host) - no external USB-serial needed! Key differentiator: native USB for HID, mass storage, serial. No Bluetooth (removed for cost/power). Great for USB peripherals, keyboards, storage. Check strapping pins and USB pins in datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32-S2 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-s2_datasheet_en.pdf" },
            { type: "trm", label: "ESP32-S2 TRM (Espressif)", url: "https://documentation.espressif.com/esp32-s2_technical_reference_manual_en.pdf" },
            { type: "guidelines", label: "ESP32-S2 Hardware Design Guidelines (Espressif)", url: "https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32s2/esp-hardware-design-guidelines-en-master-esp32s2.pdf" },
            { type: "schematic", label: "ESP32-S2-DevKitC-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-S2-DEVKITC-1_V1_20210508.pdf" },
            { type: "reference", label: "ESP32-S2 Pinout & Specs (Mischianti)", url: "https://mischianti.org/esp32-s2-pinout-specs-and-arduino-ide-configuration-1/" },
            { type: "reference", label: "USB-OTG Peripheral Guide (Espressif)", url: "https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/usb_otg.html" }
        ]
    },
    {
        id: "esp32-c6",
        title: "ESP32-C6 (Wi-Fi 6)",
        family: "ESP32-C6",
        badge: "C6",
        tags: ["wifi-6", "ble-5", "thread", "zigbee", "risc-v", "802-15-4", "low-power"],
        image: "../img/esp32/pinouts/esp32-c6-devkitc-1-pinout.png",
        alt: "ESP32-C6-DevKitC-1 pinout diagram",
        notes: "C6 is RISC-V dual-core @ 160MHz with Wi-Fi 6 (802.11ax), Bluetooth 5, and IEEE 802.15.4 for Thread/Zigbee 3.0. First ESP with Wi-Fi 6. Great for modern IoT with mesh networking. No native USB OTG (unlike S2). Check strapping pins and 802.15.4 antenna requirements in datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32-C6 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-c6_datasheet_en.pdf" },
            { type: "trm", label: "ESP32-C6 TRM (Espressif)", url: "https://docs.espressif.com/projects/esp-idf/en/latest/esp32c6/" },
            { type: "guidelines", label: "ESP32-C6 Hardware Design Guidelines (Espressif)", url: "https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/esp-hardware-design-guidelines-en-master-esp32c6.pdf" },
            { type: "schematic", label: "ESP32-C6-DevKitC-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-C6-DevKitC-1_V1.0.pdf" },
            { type: "reference", label: "ESP32-C6 DevKitC-1 Documentation", url: "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/index.html" }
        ]
    },
    {
        id: "esp32-c2",
        title: "ESP32-C2 (Budget)",
        family: "ESP32-C2",
        badge: "C2",
        tags: ["wifi-4", "ble-5", "risc-v", "low-cost", "low-power", "esp8266-replacement"],
        image: "../img/esp32/pinouts/esp32-c2-devkitm-1-pinout.png",
        alt: "ESP32-C2-DevKitM-1 pinout diagram",
        notes: "C2 is a budget-friendly RISC-V single-core @ 120MHz. Smaller and cheaper than C3/C6 - designed as ESP8266 successor. Wi-Fi 4 (802.11 b/g/n) + BLE 5 only. Great for high-volume, cost-sensitive IoT. Limited GPIO compared to larger chips. Check strapping pins and antenna requirements in datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32-C2 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-c2_datasheet_en.pdf" },
            { type: "trm", label: "ESP32-C2 TRM (Espressif)", url: "https://docs.espressif.com/projects/esp-idf/en/latest/esp32c2/" },
            { type: "guidelines", label: "ESP32-C2 Hardware Design Guidelines (Espressif)", url: "https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c2/esp-hardware-design-guidelines-en-master-esp32c2.pdf" },
            { type: "schematic", label: "ESP32-C2-DevKitM-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-C2-DevKitM-1_V1.0.pdf" },
            { type: "reference", label: "ESP32-C2 DevKitM-1 Documentation", url: "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c2/esp32-c2-devkitm-1/index.html" }
        ]
    },
    {
        id: "esp32-devkitm-1",
        title: "ESP32-DevKitM-1",
        family: "ESP32",
        badge: "DevKitM",
        tags: ["official", "devkit", "display", "lcd", "camera", "esp32-original"],
        image: "../img/esp32/pinouts/esp32-devkitm-1-pinout.png",
        alt: "ESP32-DevKitM-1 pinout diagram",
        notes: "Official Espressif entry-level dev board with integrated LCD display (supports camera modules). Uses ESP32-WROOM-32 module. Features 22 GPIOs, micro-SD card slot, and RGB LED. Good for starting with ESP32, learning, and simple projects. Check strapping pins and display/camera peripheral pins in datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "schematic", label: "ESP32-DevKitM-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-DevKitM-1_V1.pdf" },
            { type: "reference", label: "ESP32-DevKitM-1 Documentation", url: "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitm-1/index.html" }
        ]
    },
    {
        id: "esp32-pico-kit-1",
        title: "ESP32-PICO-KIT-1",
        family: "ESP32",
        badge: "PICO",
        tags: ["official", "pico", "mini", "usb-c", "esp32-original"],
        image: "../img/esp32/pinouts/esp32-pico-kit-1-pinout.png",
        alt: "ESP32-PICO-KIT-1 pinout diagram",
        notes: "Official Espressif mini development board based on ESP32-PICO module (integrated antenna, small form factor). Features USB-C port, castellated edges for soldering, and most GPIOs exposed. Great for breadboarding, prototyping, and embedded designs. Check strapping pins and peripheral mux in datasheet/TRM.",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "schematic", label: "ESP32-PICO-KIT-1 Schematic (Espressif)", url: "https://dl.espressif.com/dl/schematics/SCH_ESP32-PICO-KIT-1_V1.0.pdf" },
            { type: "reference", label: "ESP32-PICO-KIT-1 Documentation", url: "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-pico-kit-1/index.html" }
        ]
    },
    {
        id: "m5stack-core2",
        title: "M5Stack Core2",
        family: "ESP32",
        badge: "M5",
        tags: ["third-party", "m5stack", "display", "touch", "imu", "mic", "battery", "all-in-one"],
        image: "../img/esp32/pinouts/m5stack-core2-pinout.png",
        alt: "M5Stack Core2 pinout diagram",
        notes: "M5Stack Core2 is a popular all-in-one dev kit with 2\" touchscreen, built-in IMU (MPU6886), microphone, RTC, and battery. Uses ESP32 with 16MB flash. Features M-Bus expansion for add-on units. Great for IoT, UI projects, and quick prototyping. Check M-Bus pin assignments and GPIO limitations in official docs.",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "reference", label: "M5Stack Core2 Documentation", url: "https://docs.m5stack.com/en/core/Core2" },
            { type: "reference", label: "M5Stack Core2 Pinout (ESPBoards.dev)", url: "https://www.espboards.dev/esp32/m5stack-core2/" },
            { type: "schematic", label: "M5Stack Core2 Schematic (M5Stack)", url: "https://docs.m5stack.com/en/core/Core2" }
        ]
    },
    {
        id: "lilygo-ttgo-t-display",
        title: "LilyGO TTGO T-Display",
        family: "ESP32",
        badge: "TTGO",
        tags: ["third-party", "lilygo", "display", "tft", "touch", "budget", "popular"],
        image: "../img/esp32/pinouts/lilygo-ttgo-t-display-pinout.png",
        alt: "LilyGO TTGO T-Display pinout diagram",
        notes: "Popular budget display board from LilyGO with 1.14\" ST7789V TFT color display (240x135). Built-in LiPo battery charging, touch button, and CP2104 USB-serial. Great for wearables, small displays, and low-cost IoT projects. Check display GPIO sharing and touch button pin in docs/variants.",
        docs: [
            { type: "datasheet", label: "ESP32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" },
            { type: "trm", label: "ESP32 TRM (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf" },
            { type: "reference", label: "TTGO T-Display Product Page", url: "https://lilygo.cc/products/t-display" },
            { type: "reference", label: "TTGO T-Display Documentation (Mischianti)", url: "https://mischianti.org/lilygo-ttgo-t-display-pinout-specs-and-arduino-ide-configuration/" }
        ]
    },
    {
        id: "esp32-wroom",
        title: "ESP32-WROOM (Module)",
        family: "ESP32-WROOM",
        badge: "WROOM",
        tags: ["module", "datasheet", "antenna", "pinout", "footprint"],
        image: "../img/esp32/pinouts/esp32-WROOM-32-pinout.png",
        alt: "ESP32-WROOM module pinout diagram",
        notes: "WROOM is a module variant; pin naming and strapping pins matter. If you're doing custom boards, also keep the module datasheet + reference design on hand.",
        docs: [
            { type: "datasheet", label: "ESP32-WROOM-32 Datasheet (Espressif)", url: "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf" }
        ]
    }
];

/* ---------- Defensive helpers ---------- */

function asString(v, fallback = "") {
    return (typeof v === "string") ? v : fallback;
}

function asArray(v) {
    return Array.isArray(v) ? v : [];
}

function escapeHtml(str) {
    const s = asString(str, "");
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function isValidUrl(url) {
    // Allow only http:, https:, and relative URLs
    // Reject javascript:, data:, vbscript:, and other dangerous protocols
    if (!url) return false;
    const trimmed = url.trim().toLowerCase();
    // Relative paths are ok
    if (!trimmed.includes("://")) return true;
    // Allow only http:// and https://
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

function normalizeDoc(doc) {
    const d = doc || {};
    const url = asString(d.url, "").trim();
    return {
        type: asString(d.type, "reference").trim() || "reference",
        label: asString(d.label, "Link").trim() || "Link",
        url: url,
        ok: Boolean(url) && isValidUrl(url)
    };
}

function normalizeImage(img) {
    // supports:
    // - string: "path.png"
    // - object: { src, alt, label }
    if (typeof img === "string") {
        const src = img.trim();
        return {
            src,
            alt: "",
            label: ""
        };
    }

    const src = asString(img?.src, "").trim();
    return {
        src,
        alt: asString(img?.alt, "").trim(),
        label: asString(img?.label, "").trim()
    };
}

function normalizeImagesFromItem(it) {
    // Backward compatible:
    // - if it.images is an array, use it
    // - if it.images is a single object ({src,...}), wrap it
    // - else if it.image exists, wrap into images[0]
    const images = [];

    // 1) Preferred: images: [...]
    const arr = asArray(it?.images);
    if (arr.length) {
        for (const im of arr) {
            const n = normalizeImage(im);
            if (n.src) images.push(n);
        }
        return images;
    }

    // 2) Accept common mistake: images: { src, alt, label }
    const maybeObj = it?.images;
    if (maybeObj && typeof maybeObj === "object" && !Array.isArray(maybeObj)) {
        const n = normalizeImage(maybeObj);
        if (n.src) images.push(n);
        return images;
    }

    // 3) Legacy: image: "path"
    const single = asString(it?.image, "").trim();
    if (single) {
        images.push({
            src: single,
            alt: asString(it?.alt, "").trim(),
            label: ""
        });
    }

    return images;
}

function normalizedItem(item) {
    const it = item || {};
    const docs = asArray(it.docs).map(normalizeDoc).filter(d => d.ok);
    const images = normalizeImagesFromItem(it);

    return {
        id: asString(it.id, "").trim(),
        title: asString(it.title, "Untitled").trim(),
        family: asString(it.family, "Unknown").trim(),
        badge: asString(it.badge, "").trim(),
        tags: asArray(it.tags).map(t => asString(t, "").trim()).filter(Boolean),
        images,
        notes: asString(it.notes, "").trim(),
        docs
    };
}

function bestDocFor(item) {
    // Priority: datasheet > trm > schematic > guidelines > reference
    const priority = ["datasheet", "trm", "schematic", "guidelines", "reference"];
    const docs = asArray(item.docs);

    for (const type of priority) {
        const found = docs.find(d => d.type === type);
        if (found && found.url) return found;
    }
    return docs[0] || null;
}

function hasType(item, type) {
    return asArray(item.docs).some(d => d.type === type && d.url);
}

/* ---------- UI state ---------- */

const state = {
    items: PINOUTS.map(normalizedItem).filter(x => x.id),
    activeTag: "all",
    modalItem: null,
    modalImageIndex: 0
};

const elements = {
    grid: document.getElementById("pinoutsGrid"),
    chipsRow: document.getElementById("chipsRow"),
    searchInput: document.getElementById("searchInput"),
    familySelect: document.getElementById("familySelect"),
    docSelect: document.getElementById("docSelect"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    modalImg: document.getElementById("modalImg"),
    modalViewer: document.getElementById("modalViewer"),
    imageStrip: document.getElementById("imageStrip"),
    imageLabel: document.getElementById("imageLabel"),
    imageCounter: document.getElementById("imageCounter"),
    modalNotes: document.getElementById("modalNotes"),
    docList: document.getElementById("docList"),
    modalClose: document.getElementById("modalClose"),
    copyHashBtn: document.getElementById("copyHashBtn"),
    copyImgBtn: document.getElementById("copyImgBtn"),
    fitBtn: document.getElementById("fitBtn"),
    actualBtn: document.getElementById("actualBtn"),
    openBestDocBtn: document.getElementById("openBestDocBtn"),
    modalFootLeft: document.getElementById("modalFootLeft"),
    modalFootRight: document.getElementById("modalFootRight"),
    toast: document.getElementById("toast"),
    viewerStage: document.getElementById("viewerStage"),
    zoomStage: document.getElementById("zoomStage"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomResetBtn: document.getElementById("zoomResetBtn")
};

/* ---------- Toast ---------- */

let toastTimer = null;
function showToast(msg) {
    elements.toast.textContent = msg;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 1100);
}

/* ---------- Clipboard ---------- */

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            return ok;
        } catch {
            return false;
        }
    }
}

/* ---------- Build filters ---------- */

function buildFamilyOptions(items) {
    const families = Array.from(new Set(items.map(i => i.family))).sort((a, b) => a.localeCompare(b));
    for (const fam of families) {
        const opt = document.createElement("option");
        opt.value = fam;
        opt.textContent = fam;
        elements.familySelect.appendChild(opt);
    }
}

function buildTagChips(items) {
    const tagSet = new Set();
    items.forEach(it => it.tags.forEach(t => tagSet.add(t.toLowerCase())));
    const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

    const all = document.createElement("div");
    all.className = "chip active";
    all.dataset.tag = "all";
    all.textContent = "all";
    all.setAttribute("tabindex", "0");  // Make keyboard focusable
    elements.chipsRow.appendChild(all);

    for (const t of tags) {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.dataset.tag = t;
        chip.textContent = t;
        chip.setAttribute("tabindex", "0");  // Make keyboard focusable
        elements.chipsRow.appendChild(chip);
    }
}

function setActiveChip(tag) {
    elements.chipsRow.querySelectorAll(".chip").forEach(c => {
        c.classList.toggle("active", c.dataset.tag === tag);
    });
}

/* ---------- Filtering ---------- */

function filterItems() {
    const q = asString(elements.searchInput.value, "").trim().toLowerCase();
    const fam = elements.familySelect.value;
    const docMode = elements.docSelect.value;

    return state.items.filter(it => {
        if (fam !== "all" && it.family !== fam) return false;

        if (state.activeTag !== "all") {
            const has = it.tags.map(x => x.toLowerCase()).includes(state.activeTag);
            if (!has) return false;
        }

        if (docMode === "image") {
            if (!asArray(it.images).length) return false;
        } else if (docMode !== "all") {
            if (docMode === "datasheet" && !hasType(it, "datasheet")) return false;
            if (docMode === "trm" && !hasType(it, "trm")) return false;
            if (docMode === "schematic" && !hasType(it, "schematic")) return false;
        }

        if (q) {
            const hay = [
                it.id,
                it.title,
                it.family,
                it.badge,
                it.notes,
                it.tags.join(" "),
                asArray(it.docs).map(d => `${d.type} ${d.label} ${d.url}`).join(" ")
            ].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });
}

/* ---------- Rendering ---------- */

function renderRefsInline(item) {
    const docs = asArray(item.docs);
    if (!docs.length) return `No sources yet (add docs[])`;

    return docs.map(d => {
        const label = escapeHtml(d.label || d.type || "Link");
        const url = escapeHtml(d.url || "");
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }).join(" • ");
}

function renderGrid(items) {
    elements.grid.innerHTML = "";
    for (const it of items) {
        const imgs = asArray(it.images);
        const firstImg = imgs[0]?.src || "";
        const hasBest = Boolean(bestDocFor(it)?.url);

        const thumbHtml = firstImg
            ? `<img src="${escapeHtml(firstImg)}" alt="${escapeHtml(imgs[0]?.alt || it.title)}" loading="lazy">`
            : `<div style="font-family:'JetBrains Mono',monospace;color:var(--text-muted);font-size:0.75rem;padding:12px;text-align:center;">
                    NO IMAGE
               </div>`;

        const card = document.createElement("div");
        card.className = "pinout-card";
        card.innerHTML = `
            <div class="pinout-thumb" role="button" tabindex="0" data-open="${escapeHtml(it.id)}" aria-label="Open ${escapeHtml(it.title)}">
                ${thumbHtml}
            </div>
            <div class="pinout-body">
                <div class="pinout-head">
                    <div>
                        <h3 class="pinout-title">${escapeHtml(it.title)}</h3>
                        <div class="pinout-sub">${escapeHtml(it.family)}${it.badge ? ` • ${escapeHtml(it.badge)}` : ""}</div>
                    </div>
                    ${it.badge ? `<div class="badge">${escapeHtml(it.badge)}</div>` : ""}
                </div>

                <div class="meta-row">
                    <div class="meta-pill">IMAGES: ${imgs.length}</div>
                    ${hasType(it, "datasheet") ? `<div class="meta-pill">DATASHEET</div>` : ``}
                    ${hasType(it, "trm") ? `<div class="meta-pill">TRM</div>` : ``}
                    ${hasType(it, "schematic") ? `<div class="meta-pill">SCHEM</div>` : ``}
                </div>

                <p class="pinout-notes">${escapeHtml(it.notes || "")}</p>

                <div class="pinout-actions">
                    <div class="pinout-actions-left">
                        <button class="mini-btn primary" type="button" data-open="${escapeHtml(it.id)}">View</button>
                        <button class="mini-btn" type="button" data-copy-path="${escapeHtml(it.id)}">Copy Path</button>
                        <a class="mini-btn ${hasBest ? "" : "disabled"}" ${hasBest ? `href="${escapeHtml(bestDocFor(it).url)}" target="_blank" rel="noopener noreferrer"` : ""} ${hasBest ? "" : "aria-disabled='true'"} title="Open best available doc">
                            Open Doc
                        </a>
                    </div>
                    <button class="mini-btn" type="button" data-copy-link="${escapeHtml(it.id)}">Copy Link</button>
                </div>

                <div class="source-line">
                    ${renderRefsInline(it)}
                </div>
            </div>
        `;

        // Wire events
        card.querySelectorAll("[data-open]").forEach(el => {
            el.addEventListener("click", () => openModalById(it.id));
        });

        card.querySelectorAll("[data-open]").forEach(el => {
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openModalById(it.id);
                }
            });
        });

        const copyPathBtn = card.querySelector("[data-copy-path]");
        copyPathBtn.addEventListener("click", async () => {
            const first = asArray(it.images)[0];
            const ok = await copyToClipboard(first?.src || "");
            showToast(ok ? "Image path copied" : "Copy failed");
        });

        const copyLinkBtn = card.querySelector("[data-copy-link]");
        copyLinkBtn.addEventListener("click", async () => {
            const url = `${location.origin}${location.pathname}#${it.id}`;
            const ok = await copyToClipboard(url);
            showToast(ok ? "Link copied" : "Copy failed");
        });

        elements.grid.appendChild(card);
    }
}

/* ---------- Modal ---------- */

function setViewerMode(mode) {
    const viewer = elements.modalViewer;
    if (!viewer) return;

    const nextMode = (mode === "actual") ? "actual" : "fit";
    const curMode = viewer.classList.contains("actual") ? "actual" : "fit";
    const modeChanged = (nextMode !== curMode);

    viewer.classList.remove("fit", "actual");
    viewer.classList.add(nextMode);

    const stage = viewer.querySelector(".viewer-stage");
    if (stage && modeChanged) {
        // Only zero scroll when actually changed modes (fit <-> actual).
        stage.scrollTop = 0;
        stage.scrollLeft = 0;
        stage.classList.remove("dragging");
    }

    if (nextMode !== "actual") {
        resetZoom();
    }

    if (elements.fitBtn) elements.fitBtn.classList.toggle("primary", nextMode !== "actual");
    if (elements.actualBtn) elements.actualBtn.classList.toggle("primary", nextMode === "actual");
}

function setModalImage(index) {
    const it = state.modalItem;
    if (!it) return;

    const imgs = asArray(it.images);
    const safeIndex = Math.max(0, Math.min(index, imgs.length - 1));
    state.modalImageIndex = safeIndex;

    // Update active thumbnail state
    elements.imageStrip.querySelectorAll(".image-thumb").forEach((thumb, idx) => {
        thumb.classList.toggle("active", idx === safeIndex);
    });

    const im = imgs[safeIndex];

    if (im && im.src) {
        elements.modalImg.src = im.src;
        elements.modalImg.alt = im.alt || it.title || "Pinout image";
        elements.imageLabel.textContent = im.label || "";
        elements.imageCounter.textContent = `${safeIndex + 1}/${imgs.length}`;
    } else {
        // Lightweight inline placeholder SVG
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
                <rect width="100%" height="100%" fill="rgba(127,127,127,0.08)"/>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                      font-family="JetBrains Mono, monospace" font-size="28" fill="rgba(127,127,127,0.7)">
                    NO IMAGE SET FOR ${escapeHtml(it.id)}
                </text>
            </svg>
        `.trim();
        elements.modalImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        elements.modalImg.alt = "No image provided";
        elements.imageLabel.textContent = "";
        elements.imageCounter.textContent = "";
    }

    // Footer meta
    elements.modalFootLeft.textContent = `${it.family}${it.badge ? " • " + it.badge : ""}`;
    elements.modalFootRight.textContent = `#${it.id}`;
}

function openModalById(id) {
    const it = state.items.find(x => x.id === id);
    if (!it) return;

    state.modalItem = it;

    // Render image thumbnails
    const imgs = asArray(it.images);

    if (!imgs.length) {
        elements.imageStrip.innerHTML = "";
        elements.imageLabel.textContent = "";
    } else {
        elements.imageStrip.innerHTML = imgs.map((im, idx) => {
            return `
                <div class="image-thumb" data-img-idx="${idx}" tabindex="0" role="button"
                     title="${escapeHtml(im.label || `Image ${idx + 1}`)}">
                    <img src="${escapeHtml(im.src)}" alt="${escapeHtml(im.alt || it.title)}" loading="lazy">
                </div>
            `;
        }).join("");

        elements.imageStrip.querySelectorAll("[data-img-idx]").forEach(el => {
            // Click handler
            el.addEventListener("click", () => {
                const idx = parseInt(el.getAttribute("data-img-idx"), 10);
                setModalImage(idx);
            });

            // Keyboard handler: Enter/Space to activate, arrows to navigate
            el.addEventListener("keydown", (e) => {
                const thumbs = Array.from(elements.imageStrip.querySelectorAll("[data-img-idx]"));
                const currentIdx = thumbs.indexOf(el);

                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalImage(currentIdx);
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const prevIdx = currentIdx > 0 ? currentIdx - 1 : thumbs.length - 1;
                    thumbs[prevIdx].focus();
                } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const nextIdx = currentIdx < thumbs.length - 1 ? currentIdx + 1 : 0;
                    thumbs[nextIdx].focus();
                }
            });
        });
    }

    // Always default to first image
    setModalImage(0);
    resetZoom();
    setViewerMode("fit");

    elements.modalTitle.textContent = it.title || "Pinout";
    elements.modalNotes.textContent = it.notes || "";

    // docs list
    const docs = asArray(it.docs);
    if (!docs.length) {
        elements.docList.innerHTML = `
            <div style="padding: 10px; border: 1px dashed var(--border-color); border-radius: 10px; color: var(--text-secondary); font-size: 0.875rem;">
                No docs attached yet. Add <code>docs: [{ type, label, url }]</code> in the item.
            </div>
        `;
    } else {
        elements.docList.innerHTML = docs.map((d, idx) => {
            const type = escapeHtml((d.type || "reference").toUpperCase());
            const label = escapeHtml(d.label || "Link");
            const url = escapeHtml(d.url || "");
            return `
                <a class="doc-link" href="${url}" target="_blank" rel="noopener noreferrer">
                    <span class="doc-type">${type}</span>
                    <span class="doc-label">${label}</span>
                </a>
            `;
        }).join("");
    }

    // Buttons
    elements.copyHashBtn.onclick = async () => {
        const url = `${location.origin}${location.pathname}#${it.id}`;
        const ok = await copyToClipboard(url);
        showToast(ok ? "Link copied" : "Copy failed");
    };

    elements.copyImgBtn.onclick = async () => {
        const cur = imgs[state.modalImageIndex];
        const ok = await copyToClipboard(cur?.src || "");
        showToast(ok ? "Image path copied" : "Copy failed");
    };

    elements.openBestDocBtn.onclick = () => {
        const best = bestDocFor(it);
        if (best && best.url) window.open(best.url, "_blank", "noopener,noreferrer");
        else showToast("No docs available");
    };

    // Open modal
    elements.modal.classList.add("open");
    elements.modal.setAttribute("aria-hidden", "false");
    elements.modalClose.focus();

    // Update hash without jumping scroll
    if (location.hash !== "#" + it.id) {
        history.replaceState(null, "", "#" + it.id);
    }
}

/* ---------- Drag to pan (actual mode) ---------- */

(function enableDragPan() {
    const stage = document.querySelector(".viewer-stage");
    if (!stage) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    function inActualMode() {
        return elements.modalViewer && elements.modalViewer.classList.contains("actual");
    }

    stage.addEventListener("mousedown", (e) => {
        if (!inActualMode()) return;
        if (e.button !== 0) return; // left click only

        isDown = true;
        stage.classList.add("dragging");

        startX = e.clientX;
        startY = e.clientY;
        scrollLeft = stage.scrollLeft;
        scrollTop = stage.scrollTop;

        // Prevent selecting stuff while dragging
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        if (!inActualMode()) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        stage.scrollLeft = scrollLeft - dx;
        stage.scrollTop = scrollTop - dy;
    });

    function stop() {
        if (!isDown) return;
        isDown = false;
        stage.classList.remove("dragging");
    }

    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);

    // If the modal closes while dragging
    elements.modal.addEventListener("click", (e) => {
        if (e.target === elements.modal) stop();
    });
})();

/* ---------- Zoom ---------- */

const zoom = {
    scale: 1,
    min: 1,
    max: 6,
    step: 1.2
};

function inActualMode() {
    return elements.modalViewer && elements.modalViewer.classList.contains("actual");
}

function getViewerStage() {
    // Prefer explicit ID if present, but fall back safely.
    return document.getElementById("viewerStage") ||
           elements.modalViewer?.querySelector(".viewer-stage") ||
           null;
}

function getZoomStage() {
    return document.getElementById("zoomStage") ||
           elements.modalViewer?.querySelector(".zoom-stage") ||
           null;
}

function applyZoom() {
    const zs = getZoomStage();
    if (!zs) return;
    zs.style.transform = `scale(${zoom.scale})`;
}

function resetZoom() {
    zoom.scale = 1;
    applyZoom();
    const stage = getViewerStage();
    if (stage) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
    }
}

function zoomAtPoint(newScale, clientX, clientY) {
    const stage = getViewerStage();
    const zs = getZoomStage();
    if (!stage || !zs) return;

    const rect = stage.getBoundingClientRect();

    // Cursor position inside the scroll content (pre-zoom)
    const x = (clientX - rect.left) + stage.scrollLeft;
    const y = (clientY - rect.top) + stage.scrollTop;

    const oldScale = zoom.scale;
    zoom.scale = newScale;

    // Apply transform
    zs.style.transform = `scale(${zoom.scale})`;

    const ratio = zoom.scale / oldScale;

    // Keep the point under the cursor stable
    stage.scrollLeft = x * ratio - (clientX - rect.left);
    stage.scrollTop = y * ratio - (clientY - rect.top);
}

/* ---- Zoom buttons ---- */

if (elements.zoomInBtn) {
    elements.zoomInBtn.addEventListener("click", () => {
        if (!inActualMode()) setViewerMode("actual");

        const stage = getViewerStage();
        if (!stage) return;

        const newScale = Math.min(zoom.max, zoom.scale * zoom.step);
        const r = stage.getBoundingClientRect();
        zoomAtPoint(newScale, r.left + r.width / 2, r.top + r.height / 2);
    });
}

if (elements.zoomOutBtn) {
    elements.zoomOutBtn.addEventListener("click", () => {
        if (!inActualMode()) setViewerMode("actual");

        const stage = getViewerStage();
        if (!stage) return;

        const newScale = Math.max(zoom.min, zoom.scale / zoom.step);
        const r = stage.getBoundingClientRect();
        zoomAtPoint(newScale, r.left + r.width / 2, r.top + r.height / 2);
    });
}

if (elements.zoomResetBtn) {
    elements.zoomResetBtn.addEventListener("click", () => {
        if (!inActualMode()) setViewerMode("actual");
        resetZoom();
    });
}

/* ---- Ctrl+Wheel zoom ---- */

const wheelStage = getViewerStage();
if (wheelStage) {
    wheelStage.addEventListener("wheel", (e) => {
        if (!inActualMode()) return;
        if (!e.ctrlKey) return;

        e.preventDefault();

        const direction = Math.sign(e.deltaY);
        const factor = (direction > 0) ? (1 / 1.15) : 1.15;
        const newScale = Math.max(zoom.min, Math.min(zoom.max, zoom.scale * factor));

        zoomAtPoint(newScale, e.clientX, e.clientY);
    }, { passive: false });
}

/* ---------- Modal close ---------- */

function closeModal() {
    // Capture the current item id before clearing state (for focus restoration)
    const itemId = state.modalItem?.id;

    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");
    state.modalItem = null;

    if (itemId) {
        const trigger = document.querySelector(`[data-open="${itemId}"]`);
        if (trigger) trigger.focus();
    }
}

elements.modalClose.addEventListener("click", closeModal);

if (elements.fitBtn) elements.fitBtn.addEventListener("click", () => setViewerMode("fit"));
if (elements.actualBtn) elements.actualBtn.addEventListener("click", () => setViewerMode("actual"));

elements.modal.addEventListener("click", (e) => {
    if (e.target === elements.modal) closeModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.modal.classList.contains("open")) closeModal();
});

/* ---------- Init ---------- */

function init() {
    buildFamilyOptions(state.items);
    buildTagChips(state.items);

    // Chip click handlers
    elements.chipsRow.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        state.activeTag = chip.dataset.tag;
        setActiveChip(state.activeTag);
        renderGrid(filterItems());
    });

    // Chip keyboard handlers (Enter/Space to activate)
    elements.chipsRow.addEventListener("keydown", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            state.activeTag = chip.dataset.tag;
            setActiveChip(state.activeTag);
            renderGrid(filterItems());
        }
    });

    // Input handlers
    elements.searchInput.addEventListener("input", () => renderGrid(filterItems()));
    elements.familySelect.addEventListener("change", () => renderGrid(filterItems()));
    elements.docSelect.addEventListener("change", () => renderGrid(filterItems()));

    // Initial render
    renderGrid(filterItems());
}

/* ---------- Hash deep link ---------- */

function openFromHashIfPresent() {
    const id = (location.hash || "").replace("#", "").trim();
    if (!id) return;

    const exists = state.items.some(x => x.id === id);
    if (exists) openModalById(id);
}

window.addEventListener("hashchange", () => {
    // If modal is open, follow hash changes; else, open on demand
    const id = (location.hash || "").replace("#", "").trim();
    if (!id) return;
    if (state.items.some(x => x.id === id)) openModalById(id);
});

// Initialize
init();
openFromHashIfPresent();
