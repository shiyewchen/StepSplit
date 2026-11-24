# StepSplit

StepSplit separates panels in DIY instruction images and PDF pages into individual pictures. It runs locally in the browser, works on Windows and Android, and can be installed as a Progressive Web App (PWA).

## Run it

Serve this folder over `localhost` or HTTPS, then open it in a current version of Edge or Chrome. PWAs cannot be installed from a `file://` URL. For example, with Python installed:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. When the browser supports direct PWA installation, StepSplit shows **Install app** in the toolbar. Otherwise, install it from the browser menu:

- **Windows:** In Edge, open **Settings and more → Apps → Install this site as an app**. In Chrome, use **Save and share → Install page as app**.
- **Android:** In Chrome, open the menu and choose **Install app** or **Add to Home screen**.

The app shell and bundled English OCR runtime are cached for offline use after the first successful visit (about 25 MB for OCR). Image and PDF processing remains on your device.

## Use it

1. Use **File → Open image or PDF…** or **Open file** on the toolbar to choose a JPG, PNG, WebP image, or PDF (up to 40 MB and 60 pages; very large page sets may need to be split).
2. StepSplit looks for blank gutters in an image or on every PDF page and proposes panel crops.
2. Review the numbered boxes. Drag steps in the list to rearrange their order. Remove incorrect crops, or choose **Draw crop** on the toolbar and drag over a missed panel.
3. Choose **Identify text-only** to label text-only candidates. English OCR and the visual check run on your device; uncertain blocks are marked **Review**. Use **Manual** to combine selected steps, or **Auto** to merge each text-only block from step 3 onward with the following block.
4. Use **Detect steps** to rerun detection, then save an individual step or choose **Download ZIP** on the toolbar.

The automatic detector splits text or image groups separated by clear blank space, including smaller text blocks near page edges, and filters empty or line-like artifacts. Detected and manually drawn crops trim outer blank margins while retaining a small edge around the visible content. PDF pages are rendered on the device. StepSplit does not use cloud AI or upload your files. Image crops use the original image resolution; PDF crops use a high-resolution page render. PDF.js and the OCR engine are bundled locally. The service worker caches the OCR core and English model; the first text-identification run initializes the model for offline use. OCR is English-only; labels are conservative candidates, and **Review** blocks should be checked manually.
