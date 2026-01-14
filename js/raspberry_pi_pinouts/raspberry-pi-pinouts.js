// ============================================
// Raspberry Pi Pinouts
// ============================================

/*
    Data model goals:
    - No required fields (missing image/docs/notes should never crash the UI).
    - Supports single image OR multi-image boards.
    - Supports as much "root truth" sources as you want.
    - UI chooses "best" doc automatically (datasheet > TRM > schematic > guidelines > reference).

    Each item supports:
      {
        id: "unique-id",
        title: "Name",
        family: "Raspberry Pi | Raspberry Pi Zero | Raspberry Pi Pico | Compute Module | ...",
        badge: "short label (optional)",
        tags: ["..."],
        notes: "optional text",

        // Preferred:
        images: [
          { src: "../img/raspberry_pi/pinouts/foo.png", alt: "desc", label: "Front" },
          { src: "../img/raspberry_pi/pinouts/foo2.png", alt: "desc", label: "Back" }
        ],

        // Back-compat:
        image: "../img/raspberry_pi/pinouts/foo.png",
        alt: "desc",

        docs: [
          { type: "datasheet" | "trm" | "schematic" | "guidelines" | "reference", label: "text", url: "https://..." }
        ]
      }
*/

const PINOUTS = [
    {
        id: "rpi-5",
        title: "Raspberry Pi 5",
        family: "Raspberry Pi",
        badge: "Pi5",
        tags: ["flagship", "pcie", "gpio", "i2c", "spi", "uart", "usb3", "dual-display"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi_5.jpg",
                alt: "Pi 5 Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO-Pinout-Diagram-2.png",
                alt: "General Pi GPIO",
                label: "GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO.png",
                alt: "General Pi GPIO Alt,",
                label: "GPIO"
            }
        ],
        notes: "Latest flagship Pi with RP1 I/O controller, PCIe slot, and significantly improved performance. GPIO is electrically similar to Pi 4 but active cooler recommended. Check RP1 peripheral docs for low-level programming.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi 5 Datasheet", url: "https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf" },
            { type: "datasheet", label: "RP1 Peripherals Datasheet", url: "https://datasheets.raspberrypi.com/rp1/rp1-peripherals.pdf" },
            { type: "schematic", label: "Raspberry Pi 5 Schematics (Reduced)", url: "https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-schematics.pdf" },
            { type: "guidelines", label: "Raspberry Pi 5 Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf" },
            { type: "reference", label: "Official GPIO Documentation", url: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio" }
        ]
    },
    {
        id: "rpi-4b",
        title: "Raspberry Pi 4 Model B",
        family: "Raspberry Pi",
        badge: "Pi4",
        tags: ["popular", "gpio", "i2c", "spi", "uart", "usb3", "dual-display", "gigabit"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-4-model-b.jpg",
                alt: "Pi 4 Model B Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO-Pinout-Diagram-2.png",
                alt: "General Pi GPIO",
                label: "GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO.png",
                alt: "General Pi GPIO Alt,",
                label: "GPIO"
            }
        ],
        notes: "Most widely deployed Pi. Available in 1/2/4/8GB variants. Same 40-pin GPIO as Pi 3B+ but with upgraded BCM2711 SoC. Watch for USB-C power quirks on early revisions.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi 4B Datasheet", url: "https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf" },
            { type: "datasheet", label: "BCM2711 ARM Peripherals", url: "https://datasheets.raspberrypi.com/bcm2711/bcm2711-peripherals.pdf" },
            { type: "schematic", label: "Raspberry Pi 4B Schematics (Reduced)", url: "https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-reduced-schematics.pdf" },
            { type: "guidelines", label: "Raspberry Pi 4B Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-mechanical-drawing.pdf" },
            { type: "reference", label: "Official GPIO Documentation", url: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio" }
        ]
    },
    {
        id: "rpi-3b-plus",
        title: "Raspberry Pi 3 Model B+",
        family: "Raspberry Pi",
        badge: "Pi3+",
        tags: ["legacy", "gpio", "i2c", "spi", "uart", "wifi", "bluetooth", "poe-header"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-3-model-b-plus.jpg",
                alt: "Pi 3 Model B+ Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO-Pinout-Diagram-2.png",
                alt: "General Pi GPIO",
                label: "GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO.png",
                alt: "General Pi GPIO Alt,",
                label: "GPIO"
            }
        ],
        notes: "Final revision of Pi 3 series. Introduced PoE header pins. Good balance of compatibility and performance for legacy projects. BCM2837B0 SoC.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi 3B+ Datasheet", url: "https://datasheets.raspberrypi.com/rpi3/raspberry-pi-3-b-plus-product-brief.pdf" },
            { type: "schematic", label: "Raspberry Pi 3B+ Schematics (Reduced)", url: "https://datasheets.raspberrypi.com/rpi3/raspberry-pi-3-b-plus-reduced-schematics.pdf" },
            { type: "guidelines", label: "Raspberry Pi 3B+ Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpi3/raspberry-pi-3-b-plus-mechanical-drawing.pdf" },
            { type: "reference", label: "BCM2835 ARM Peripherals (applies to 2835/2836/2837)", url: "https://datasheets.raspberrypi.com/bcm2835/bcm2835-peripherals.pdf" }
        ]
    },
    {
        id: "rpi-zero-2w",
        title: "Raspberry Pi Zero 2 W",
        family: "Raspberry Pi Zero",
        badge: "Z2W",
        tags: ["compact", "wifi", "bluetooth", "gpio", "low-power", "camera"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-zero-2-w.jpg",
                alt: "Pi Zero 2W Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO-Pinout-Diagram-2.png",
                alt: "General Pi GPIO",
                label: "GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO.png",
                alt: "General Pi GPIO Alt,",
                label: "GPIO"
            }
        ],
        notes: "Quad-core upgrade to Zero W in the same form factor. Same 40-pin GPIO (unpopulated). Great for embedded/portable projects. RP3A0 SoC (BCM2710A1-based).",
        docs: [
            { type: "datasheet", label: "Raspberry Pi Zero 2 W Datasheet", url: "https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-product-brief.pdf" },
            { type: "schematic", label: "Raspberry Pi Zero 2 W Schematics (Reduced)", url: "https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-reduced-schematics.pdf" },
            { type: "guidelines", label: "Raspberry Pi Zero 2 W Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-mechanical-drawing.pdf" },
            { type: "reference", label: "Raspberry Pi Zero 2 W Test Pads", url: "https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-test-pads.pdf" }
        ]
    },
    {
        id: "rpi-zero-w",
        title: "Raspberry Pi Zero W",
        family: "Raspberry Pi Zero",
        badge: "ZW",
        tags: ["compact", "wifi", "bluetooth", "gpio", "low-power", "legacy"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-zero-w.jpg",
                alt: "Pi Zero W Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO-Pinout-Diagram-2.png",
                alt: "General Pi GPIO",
                label: "GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-GPIO.png",
                alt: "General Pi GPIO Alt,",
                label: "GPIO"
            }
        ],
        notes: "Original compact Pi with WiFi/BT. Single-core BCM2835. GPIO header unpopulated by default. Still useful for simple IoT projects where power/size matter.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi Zero W Datasheet", url: "https://datasheets.raspberrypi.com/rpizero/raspberry-pi-zero-w-product-brief.pdf" },
            { type: "schematic", label: "Raspberry Pi Zero W Schematics (Reduced)", url: "https://datasheets.raspberrypi.com/rpizero/raspberry-pi-zero-w-reduced-schematics.pdf" },
            { type: "guidelines", label: "Raspberry Pi Zero W Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpizero/raspberry-pi-zero-w-mechanical-drawing.pdf" },
            { type: "reference", label: "BCM2835 ARM Peripherals", url: "https://datasheets.raspberrypi.com/bcm2835/bcm2835-peripherals.pdf" }
        ]
    },
    {
        id: "rpi-pico-2",
        title: "Raspberry Pi Pico 2 / Pico 2 W",
        family: "Raspberry Pi Pico",
        badge: "Pico2",
        tags: ["microcontroller", "rp2350", "dual-core", "arm", "risc-v", "pio", "adc", "pwm"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-pico-2-w.png",
                alt: "Pi Pico 2W Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/pico2w-pinout.png",
                alt: "GPIO Pico 2W",
                label: "Pico 2W / GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-pico-2.png",
                alt: "Pi Pico 2 Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/pico-2-r4-pinout.png",
                alt: "Pico 2 GPIO pinout diagram",
                label: "Pico 2 / GPIO"
            }
        ],
        notes: "RP2350-based upgrade to Pico. Switchable Arm Cortex-M33 / Hazard3 RISC-V cores. More RAM, security features. Pico 2 W adds WiFi/BT via CYW43439. Pin-compatible with original Pico.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi Pico 2 Datasheet", url: "https://datasheets.raspberrypi.com/pico/pico-2-datasheet.pdf" },
            { type: "datasheet", label: "RP2350 Datasheet", url: "https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf" },
            { type: "reference", label: "Pico 2 W Datasheet", url: "https://datasheets.raspberrypi.com/picow/pico-2-w-datasheet.pdf" },
            { type: "guidelines", label: "Hardware Design with RP2350", url: "https://datasheets.raspberrypi.com/rp2350/hardware-design-with-rp2350.pdf" },
            { type: "reference", label: "Pico SDK Documentation", url: "https://www.raspberrypi.com/documentation/microcontrollers/c_sdk.html" },
            { type: "reference", label: "MicroPython Documentation", url: "https://www.raspberrypi.com/documentation/microcontrollers/micropython.html" }
        ]
    },
    {
        id: "rpi-pico",
        title: "Raspberry Pi Pico / Pico W",
        family: "Raspberry Pi Pico",
        badge: "Pico",
        tags: ["microcontroller", "rp2040", "dual-core", "pio", "adc", "pwm", "popular"],
        images: [
            {
                src: "../img/raspberry_pi/pinouts/Pi-pico-w.png",
                alt: "Pi Pico W Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/picow-pinout.png",
                alt: "Pico W GPIO pinout diagram",
                label: "Pico W / GPIO"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-pico.png",
                alt: "Pi Pico Board",
                label: "Board"
            },
            {
                src: "../img/raspberry_pi/pinouts/pico-pinout.png",
                alt: "Pico GPIO pinout diagram",
                label: "Pico / GPIO"
            }
        ],
        notes: "RP2040-based microcontroller. Dual-core Arm Cortex-M0+ with unique PIO (Programmable I/O) state machines. Pico W adds WiFi/BT. Pico H/WH variants come with pre-soldered headers and debug connector.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi Pico Datasheet", url: "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf" },
            { type: "datasheet", label: "RP2040 Datasheet", url: "https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf" },
            { type: "datasheet", label: "Pico W Datasheet", url: "https://datasheets.raspberrypi.com/picow/pico-w-datasheet.pdf" },
            { type: "guidelines", label: "Hardware Design with RP2040", url: "https://datasheets.raspberrypi.com/rp2040/hardware-design-with-rp2040.pdf" },
            { type: "reference", label: "Getting Started with Pico", url: "https://datasheets.raspberrypi.com/pico/getting-started-with-pico.pdf" },
            { type: "reference", label: "Pico SDK Documentation", url: "https://www.raspberrypi.com/documentation/microcontrollers/c_sdk.html" },
            { type: "reference", label: "Pico Python SDK", url: "https://datasheets.raspberrypi.com/pico/raspberry-pi-pico-python-sdk.pdf" }
        ]
    },
    {
        id: "rpi-compute-module-4",
        title: "Raspberry Pi Compute Module 4",
        family: "Compute Module",
        badge: "CM4",
        tags: ["industrial", "sodimm", "emmc", "pcie", "custom-carrier", "embedded"],
        images: [
        {
                src: "../img/raspberry_pi/pinouts/Pi-compute-module-4.jpg",
                alt: "Compute Module 4 Board",
                label: "Board Front"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4LiteBack.jpg",
                alt: "Compute Module 4 Board",
                label: "Board Back"
            },
            {
                src: "../img/raspberry_pi/pinouts/pi4j-rpi-cm4-header.png",
                alt: "CM4 IO Board via Pi4J",
                label: "IO Board pinout"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-1-27.png",
                alt: "Compute Module 4 pinout 1 -27",
                label: "CM4 Pinout /  1-27"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-28-52.png",
                alt: "Compute Module 4 pinout 28-52",
                label: "CM4 Pinout /  28-52"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-53-82.png",
                alt: "Compute Module 4 pinout 53-82",
                label: "CM4 Pinout /  53-82"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-83-111.png",
                alt: "Compute Module 4 pinout 83-111",
                label: "CM4 Pinout /  83-111"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-112-145.png",
                alt: "Compute Module 4 pinout 112-145",
                label: "CM4 Pinout /  112-145"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-146-176.png",
                alt: "Compute Module 4 pinout 146-176",
                label: "CM4 Pinout /  146-176"
            },
            {
                src: "../img/raspberry_pi/pinouts/Pi-CM4-Pinout-177-200.png",
                alt: "Compute Module 4 pinout 177-200",
                label: "CM4 Pinout /  177-200"
            }
        ],
        notes: "Industrial/embedded form factor with BCM2711. Available with/without WiFi/BT and eMMC (Lite variant uses SD). Requires carrier board. 2x 100-pin high-density connectors. Great for custom products.",
        docs: [
            { type: "datasheet", label: "Compute Module 4 Datasheet", url: "https://datasheets.raspberrypi.com/cm4/cm4-datasheet.pdf" },
            { type: "datasheet", label: "CM4 IO Board Datasheet", url: "https://datasheets.raspberrypi.com/cm4io/cm4io-datasheet.pdf" },
            { type: "schematic", label: "CM4 IO Board Schematics (KiCad)", url: "https://datasheets.raspberrypi.com/cm4io/CM4IO-KiCAD.zip" },
            { type: "guidelines", label: "CM4 IO Board Schematics (PDF)", url: "https://datasheets.raspberrypi.com/cm4io/cm4io-schematics.pdf" },
            { type: "reference", label: "BCM2711 ARM Peripherals", url: "https://datasheets.raspberrypi.com/bcm2711/bcm2711-peripherals.pdf" },
            { type: "reference", label: "CM4 Connector Hack", url: "https://www.digikey.ca/en/maker/projects/creating-a-raspberry-pi-compute-module-4-cm4-carrier-board-in-kicad/7812da347e5e409aa28d59ea2aaea490" }
        ]
    },
    {
        id: "rpi-compute-module-5",
        title: "Raspberry Pi Compute Module 5",
        family: "Compute Module",
        badge: "CM5",
        tags: ["industrial", "pcie-gen3", "custom-carrier", "embedded", "high-performance"],
        notes: "Latest Compute Module based on Pi 5 silicon. PCIe Gen 3 x1, 2/4/8GB RAM, optional eMMC and WiFi/BT. Same 2x 100-pin connector as CM4 but NOT fully backward compatible - check compatibility matrix.",
        docs: [
            { type: "datasheet", label: "Compute Module 5 Datasheet", url: "https://datasheets.raspberrypi.com/cm5/cm5-datasheet.pdf" },
            { type: "datasheet", label: "CM5 IO Board Datasheet", url: "https://datasheets.raspberrypi.com/cm5io/cm5io-datasheet.pdf" },
            { type: "schematic", label: "CM5 IO Board Schematics (PDF)", url: "https://datasheets.raspberrypi.com/cm5io/cm5io-schematics.pdf" },
            { type: "guidelines", label: "CM5 IO Board KiCad Files", url: "https://datasheets.raspberrypi.com/cm5io/CM5IO-KiCAD.zip" },
            { type: "reference", label: "RP1 Peripherals Datasheet", url: "https://datasheets.raspberrypi.com/rp1/rp1-peripherals.pdf" }
        ]
    },
    {
        id: "rpi-400",
        title: "Raspberry Pi 400",
        family: "Raspberry Pi",
        badge: "Pi400",
        tags: ["keyboard", "all-in-one", "gpio", "desktop"],
        notes: "Pi 4 integrated into keyboard form factor. 40-pin GPIO accessible via rear header. Slightly higher clock speed than stock Pi 4. Good for desktop use and education.",
        docs: [
            { type: "datasheet", label: "Raspberry Pi 400 Datasheet", url: "https://datasheets.raspberrypi.com/rpi400/raspberry-pi-400-product-brief.pdf" },
            { type: "datasheet", label: "BCM2711 ARM Peripherals", url: "https://datasheets.raspberrypi.com/bcm2711/bcm2711-peripherals.pdf" },
            { type: "guidelines", label: "Raspberry Pi 400 Mechanical Drawing", url: "https://datasheets.raspberrypi.com/rpi400/raspberry-pi-400-mechanical-drawing.pdf" },
            { type: "reference", label: "Official GPIO Documentation", url: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio" }
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

        // Keep notes
        notes: asString(it.notes, "").trim(),

        // Docs stay board-level
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
    picoWarning: document.getElementById("picoWarning"),

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
    elements.chipsRow.appendChild(all);

    for (const t of tags) {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.dataset.tag = t;
        chip.textContent = t;
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
    const curMode  = viewer.classList.contains("actual") ? "actual" : "fit";
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

    // Show Pico GPIO warning for Pico-family boards
    if (it.family === "Raspberry Pi Pico") {
        elements.picoWarning.style.display = "";
    } else {
        elements.picoWarning.style.display = "none";
    }

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

(function enableDragPan() {
    const stage = document.querySelector(".viewer-stage");
    if (!stage) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

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
    stage.scrollTop  = y * ratio - (clientY - rect.top);
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


function closeModal() {
    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");

    if (state.modalItem) {
        const trigger = document.querySelector(`[data-open="${state.modalItem.id}"]`);
        if (trigger) trigger.focus();
    }

    state.modalItem = null;
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

init();

openFromHashIfPresent();
