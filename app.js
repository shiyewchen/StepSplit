(() => {
  const fileInput = document.querySelector("#file-input");
  const browseButton = document.querySelector("#browse-button");
  const toolbarOpenButton = document.querySelector("#toolbar-open");
  const installAppButton = document.querySelector("#install-app-button");
  const toolbarDetectButton = document.querySelector("#toolbar-detect");
  const toolbarCropButton = document.querySelector("#toolbar-crop");
  const toolbarExportButton = document.querySelector("#toolbar-export");
  const menuOpenButton = document.querySelector("#menu-open");
  const menuCloseFileButton = document.querySelector("#menu-close-file");
  const menuExportButton = document.querySelector("#menu-export");
  const menuDetectButton = document.querySelector("#menu-detect");
  const menuDrawButton = document.querySelector("#menu-draw");
  const dropZone = document.querySelector("#drop-zone");
  const uploadStatus = document.querySelector("#upload-status");
  const pagePickerLabel = document.querySelector("#page-picker-label");
  const pagePicker = document.querySelector("#page-picker");
  const editor = document.querySelector("#editor");
  const preview = document.querySelector("#preview");
  const stepList = document.querySelector("#step-list");
  const stepCount = document.querySelector("#step-count");
  const emptySteps = document.querySelector("#empty-steps");
  const drawButton = document.querySelector("#draw-button");
  const drawHint = document.querySelector("#draw-hint");
  const replaceButton = document.querySelector("#replace-button");
  const redetectButton = document.querySelector("#redetect-button");
  const combineButton = document.querySelector("#combine-button");
  const mergeTextOnlyButton = document.querySelector("#merge-text-only-button");
  const textDetectButton = document.querySelector("#text-detect-button");
  const downloadAllButton = document.querySelector("#download-all-button");
  const statusMessage = document.querySelector("#status-message");
  const previewContext = preview.getContext("2d", { willReadFrequently: true });
  const MAX_FILE_SIZE = 40 * 1024 * 1024;
  const MAX_PREVIEW_EDGE = 1400;
  const MAX_PDF_RENDER_EDGE = 2000;
  const MAX_PDF_PAGES = 60;
  const MAX_PDF_PREVIEW_PIXELS = 24_000_000;

  let sourceFile = null;
  let sourceImage = null;
  let sourcePages = [];
  let activePageIndex = 0;
  let pageActivationRequest = 0;
  let regions = [];
  let drawing = false;
  let drawStart = null;
  let drawEnd = null;
  let exporting = false;
  let textAnalyzing = false;
  let tesseractLoadPromise = null;
  let draggedStepIndex = null;
  let deferredInstallPrompt = null;
  const selectedStepIndexes = new Set();

  const setStatus = (message, isError = false) => {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("error", isError);
  };

  const getTextOnlyMergeIndexes = () => {
    const indexes = [];
    for (let index = 2; index < regions.length - 1;) {
      if (regions[index].textClassification && regions[index].textClassification.kind === "text-only") {
        indexes.push(index);
        index += 2;
      } else {
        index += 1;
      }
    }
    return indexes;
  };

  const renderPreview = () => {
    if (!sourceImage) return;
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(sourceImage, 0, 0, preview.width, preview.height);
    regions.forEach((region, index) => {
      if (region.pageIndex !== activePageIndex) return;
      const bounds = region.previewBounds || region;
      previewContext.fillStyle = "rgba(56, 95, 220, 0.08)";
      previewContext.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      previewContext.strokeStyle = "#4169e1";
      previewContext.lineWidth = Math.max(2, preview.width / 500);
      previewContext.setLineDash([]);
      previewContext.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      previewContext.fillStyle = "#4169e1";
      previewContext.beginPath();
      previewContext.arc(bounds.x + 14, bounds.y + 14, 11, 0, Math.PI * 2);
      previewContext.fill();
      previewContext.fillStyle = "#fff";
      previewContext.font = `700 ${Math.max(11, preview.width / 90)}px sans-serif`;
      previewContext.textAlign = "center";
      previewContext.textBaseline = "middle";
      previewContext.fillText(String(index + 1), bounds.x + 14, bounds.y + 14);
    });

    if (drawing && drawStart && drawEnd) {
      previewContext.strokeStyle = "#e25858";
      previewContext.lineWidth = Math.max(2, preview.width / 500);
      previewContext.setLineDash([7, 5]);
      previewContext.strokeRect(
        drawStart.x,
        drawStart.y,
        drawEnd.x - drawStart.x,
        drawEnd.y - drawStart.y,
      );
      previewContext.setLineDash([]);
    }
  };

  const updateSteps = () => {
    selectedStepIndexes.forEach((index) => {
      if (index >= regions.length) selectedStepIndexes.delete(index);
    });
    stepList.replaceChildren();
    stepCount.textContent = String(regions.length);
    emptySteps.hidden = regions.length > 0;
    downloadAllButton.disabled = regions.length === 0 || exporting;
    textDetectButton.disabled = regions.length === 0 || exporting;
    textDetectButton.textContent = textAnalyzing ? "Identifying text…" : "Identify text-only";
    drawButton.disabled = !sourcePages.length || exporting;
    redetectButton.disabled = !sourcePages.length || exporting;
    replaceButton.disabled = exporting;
    combineButton.disabled = selectedStepIndexes.size < 2 || exporting;
    combineButton.textContent = "Manual";
    mergeTextOnlyButton.disabled = getTextOnlyMergeIndexes().length === 0 || exporting;
    toolbarDetectButton.disabled = !sourcePages.length || exporting;
    toolbarCropButton.disabled = !sourcePages.length || exporting;
    toolbarExportButton.disabled = regions.length === 0 || exporting;
    menuCloseFileButton.disabled = !sourcePages.length || exporting;
    menuExportButton.disabled = regions.length === 0 || exporting;
    menuDetectButton.disabled = !sourcePages.length || exporting;
    menuDrawButton.disabled = !sourcePages.length || exporting;

    regions.forEach((region, index) => {
      const item = document.createElement("li");
      item.className = "step-item";
      item.draggable = !exporting;
      item.setAttribute("aria-label", `Step ${index + 1}, drag to rearrange`);
      item.classList.toggle("is-selected", selectedStepIndexes.has(index));
      item.tabIndex = exporting ? -1 : 0;
      item.setAttribute("role", "checkbox");
      item.setAttribute("aria-checked", String(selectedStepIndexes.has(index)));
      const stepNumber = document.createElement("span");
      stepNumber.className = "step-number";
      stepNumber.textContent = String(index + 1);
      stepNumber.setAttribute("aria-hidden", "true");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "step-checkbox";
      checkbox.checked = selectedStepIndexes.has(index);
      checkbox.disabled = exporting;
      checkbox.setAttribute("aria-label", `Select step ${index + 1}`);
      const syncSelection = () => {
        if (checkbox.checked) selectedStepIndexes.add(index);
        else selectedStepIndexes.delete(index);
        item.classList.toggle("is-selected", checkbox.checked);
        item.setAttribute("aria-checked", String(checkbox.checked));
        combineButton.disabled = selectedStepIndexes.size < 2 || exporting;
        combineButton.textContent = "Manual";
      };
      checkbox.addEventListener("change", () => {
        syncSelection();
      });
      item.append(checkbox, stepNumber);
      item.addEventListener("click", (event) => {
        if (exporting || (event.target instanceof Element && event.target.closest("button, input"))) return;
        checkbox.checked = !checkbox.checked;
        syncSelection();
      });
      item.addEventListener("keydown", (event) => {
        if (exporting || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        checkbox.checked = !checkbox.checked;
        syncSelection();
      });
      item.addEventListener("dragstart", (event) => {
        draggedStepIndex = index;
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        item.classList.add("drop-before");
      });
      item.addEventListener("dragleave", () => item.classList.remove("drop-before"));
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        item.classList.remove("drop-before");
        const sourceIndex = draggedStepIndex;
        if (sourceIndex === null || sourceIndex === index) return;
        const [movedRegion] = regions.splice(sourceIndex, 1);
        regions.splice(index, 0, movedRegion);
        draggedStepIndex = null;
        selectedStepIndexes.clear();
        setStatus(`Moved step to position ${index + 1}.`);
        updateSteps();
      });
      item.addEventListener("dragend", () => {
        draggedStepIndex = null;
        item.classList.remove("is-dragging");
        stepList.querySelectorAll(".drop-before").forEach((step) => {
          step.classList.remove("drop-before");
        });
      });

      const thumbnail = document.createElement("canvas");
      thumbnail.className = "step-thumbnail";
      if (region.combined) thumbnail.classList.add("is-combined");
      thumbnail.width = 120;
      thumbnail.height = 88;
      const thumbnailContext = thumbnail.getContext("2d");
      thumbnailContext.fillStyle = "#f4f6fb";
      thumbnailContext.fillRect(0, 0, thumbnail.width, thumbnail.height);
      if (region.combined) {
        const scale = Math.min(
          (thumbnail.width - 8) / region.width,
          (thumbnail.height - 8) / region.height,
        );
        const width = region.width * scale;
        const height = region.height * scale;
        thumbnailContext.drawImage(
          region.canvas,
          (thumbnail.width - width) / 2,
          (thumbnail.height - height) / 2,
          width,
          height,
        );
      } else {
        const page = sourcePages[region.pageIndex];
        const scale = Math.min(
          (thumbnail.width - 8) / region.width,
          (thumbnail.height - 8) / region.height,
        );
        const width = region.width * scale;
        const height = region.height * scale;
        thumbnailContext.drawImage(
          page.previewCanvas,
          region.x,
          region.y,
          region.width,
          region.height,
          (thumbnail.width - width) / 2,
          (thumbnail.height - height) / 2,
          width,
          height,
        );
      }

      const info = document.createElement("div");
      info.className = "step-info";
      const title = document.createElement("p");
      title.className = "step-title";
      title.textContent = region.combined ? `Combined step ${index + 1}` : `Step ${index + 1}`;
      const dimensions = document.createElement("p");
      dimensions.className = "step-dimensions";
      if (region.combined) {
        dimensions.textContent = `${region.width} × ${region.height} px`;
      } else {
        const page = sourcePages[region.pageIndex];
        const pageLabel = page.label ? `${page.label} · ` : "";
        dimensions.textContent = `${pageLabel}${Math.round(region.width * page.width / page.previewCanvas.width)} × ${Math.round(region.height * page.height / page.previewCanvas.height)} px`;
      }
      info.append(title, dimensions);
      if (region.textClassification) {
        const classification = document.createElement("span");
        classification.className = `text-classification text-classification-${region.textClassification.kind}`;
        classification.textContent = region.textClassification.label;
        info.append(classification);
      }

      const actions = document.createElement("div");
      actions.className = "step-actions";
      const download = document.createElement("button");
      download.type = "button";
      download.className = "small-button";
      download.textContent = "Save";
      download.setAttribute("aria-label", `Save step ${index + 1}`);
      download.disabled = exporting;
      download.addEventListener("click", async () => {
        try {
          setStatus(`Preparing step ${index + 1}…`);
          const blob = await createCropBlob(region);
          saveBlob(blob, makeStepFileName(index));
          setStatus(`Saved step ${index + 1}.`);
        } catch (error) {
          console.error("Could not export image step:", error);
          setStatus("Could not export this step. Try a smaller image or another browser.", true);
        }
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "small-button remove-button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove step ${index + 1}`);
      remove.disabled = exporting;
      remove.addEventListener("click", () => {
        regions.splice(index, 1);
        selectedStepIndexes.clear();
        setStatus("");
        renderPreview();
        updateSteps();
      });

      actions.append(download, remove);
      item.append(thumbnail, info, actions);
      stepList.append(item);
    });

    renderPreview();
  };

  const activePixelIntegral = (imageData, width, height) => {
    const stride = width + 1;
    const integral = new Uint32Array((width + 1) * (height + 1));
    for (let y = 1; y <= height; y += 1) {
      let rowTotal = 0;
      for (let x = 1; x <= width; x += 1) {
        const pixel = ((y - 1) * width + x - 1) * 4;
        const luminance = (
          imageData.data[pixel] * 299 +
          imageData.data[pixel + 1] * 587 +
          imageData.data[pixel + 2] * 114
        ) / 1000;
        if (imageData.data[pixel + 3] > 16 && luminance < 250) rowTotal += 1;
        integral[y * stride + x] = integral[(y - 1) * stride + x] + rowTotal;
      }
    }
    return integral;
  };

  const countInRect = (integral, stride, x1, y1, x2, y2) => (
    integral[y2 * stride + x2] -
    integral[y1 * stride + x2] -
    integral[y2 * stride + x1] +
    integral[y1 * stride + x1]
  );

  const findGap = (rect, axis, integral, canvasWidth) => {
    const horizontal = axis === "horizontal";
    const start = horizontal ? rect.y : rect.x;
    const end = horizontal ? rect.y + rect.height : rect.x + rect.width;
    const crossStart = horizontal ? rect.x : rect.y;
    const crossEnd = horizontal ? rect.x + rect.width : rect.y + rect.height;
    const crossLength = crossEnd - crossStart;
    const axisLength = end - start;
    const inset = Math.max(3, Math.floor(axisLength * 0.025));
    const quietLimit = Math.max(1, Math.floor(crossLength * 0.002));
    const stride = canvasWidth + 1;
    let best = null;
    let runStart = -1;
    const minimumGap = Math.max(24, Math.floor(axisLength * 0.02));
    const minimumSide = Math.max(12, Math.floor(axisLength * 0.02));
    const considerGap = (gapStart, gapEnd) => {
      const length = gapEnd - gapStart;
      if (
        length >= minimumGap &&
        gapStart - start >= minimumSide &&
        end - gapEnd >= minimumSide &&
        (!best || length > best.length)
      ) {
        best = { start: gapStart, end: gapEnd, length };
      }
    };

    for (let position = start + inset; position < end - inset; position += 1) {
      const ink = horizontal
        ? countInRect(integral, stride, crossStart, position, crossEnd, position + 1)
        : countInRect(integral, stride, position, crossStart, position + 1, crossEnd);
      if (ink <= quietLimit) {
        if (runStart === -1) runStart = position;
      } else if (runStart !== -1) {
        considerGap(runStart, position);
        runStart = -1;
      }
    }

    if (runStart !== -1) {
      considerGap(runStart, end - inset);
    }

    if (!best) return null;

    return { ...best, axis, score: best.length / axisLength };
  };

  const trimRegion = (region, integral, canvasWidth, canvasHeight) => {
    const stride = canvasWidth + 1;
    const leftEdge = Math.max(0, Math.floor(region.x));
    const topEdge = Math.max(0, Math.floor(region.y));
    const rightEdge = Math.min(canvasWidth, Math.ceil(region.x + region.width));
    const bottomEdge = Math.min(canvasHeight, Math.ceil(region.y + region.height));
    let left = leftEdge;
    let top = topEdge;
    let right = rightEdge;
    let bottom = bottomEdge;

    while (top < bottom && countInRect(integral, stride, left, top, right, top + 1) === 0) top += 1;
    while (bottom > top && countInRect(integral, stride, left, bottom - 1, right, bottom) === 0) bottom -= 1;
    while (left < right && countInRect(integral, stride, left, top, left + 1, bottom) === 0) left += 1;
    while (right > left && countInRect(integral, stride, right - 1, top, right, bottom) === 0) right -= 1;

    if (left === right || top === bottom) return region;

    const padding = Math.max(2, Math.round(Math.min(rightEdge - leftEdge, bottomEdge - topEdge) * 0.015));
    left = Math.max(leftEdge, left - padding);
    top = Math.max(topEdge, top - padding);
    right = Math.min(rightEdge, right + padding);
    bottom = Math.min(bottomEdge, bottom + padding);

    return {
      ...region,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  };

  const hasSubstantialContent = (region, integral, canvasWidth) => {
    if (region.width < 24 && region.height < 24) return false;

    const stride = canvasWidth + 1;
    const left = Math.max(0, Math.floor(region.x));
    const top = Math.max(0, Math.floor(region.y));
    const right = Math.min(canvasWidth, Math.ceil(region.x + region.width));
    const bottom = Math.ceil(region.y + region.height);
    const minimumRowInk = Math.max(2, Math.floor((right - left) * 0.002));
    const minimumColumnInk = Math.max(2, Math.floor((bottom - top) * 0.002));
    let activeRows = 0;
    let activeColumns = 0;

    for (let y = top; y < bottom; y += 1) {
      if (countInRect(integral, stride, left, y, right, y + 1) >= minimumRowInk) activeRows += 1;
    }
    for (let x = left; x < right; x += 1) {
      if (countInRect(integral, stride, x, top, x + 1, bottom) >= minimumColumnInk) activeColumns += 1;
    }

    if (!activeRows || !activeColumns) return false;
    if (region.height < 24 && activeRows < Math.max(3, Math.ceil(region.height * 0.5))) return false;
    if (region.width < 24 && activeColumns < Math.max(3, Math.ceil(region.width * 0.5))) return false;
    return true;
  };

  const detectRegions = (canvas) => {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = context.getImageData(0, 0, width, height);
    const integral = activePixelIntegral(imageData, width, height);
    const regionsFound = [];
    const maxRegions = 40;
    const split = (rect, depth = 0) => {
      if (depth >= 8 || regionsFound.length >= maxRegions - 1) {
        regionsFound.push(rect);
        return;
      }
      const horizontalGap = findGap(rect, "horizontal", integral, width);
      const verticalGap = findGap(rect, "vertical", integral, width);
      const gap = !horizontalGap ? verticalGap
        : !verticalGap ? horizontalGap
          : horizontalGap.score >= verticalGap.score ? horizontalGap : verticalGap;
      if (!gap) {
        regionsFound.push(rect);
        return;
      }

      if (gap.axis === "horizontal") {
        split({ ...rect, height: gap.start - rect.y }, depth + 1);
        split({
          x: rect.x,
          y: gap.end,
          width: rect.width,
          height: rect.y + rect.height - gap.end,
        }, depth + 1);
      } else {
        split({ ...rect, width: gap.start - rect.x }, depth + 1);
        split({
          x: gap.end,
          y: rect.y,
          width: rect.x + rect.width - gap.end,
          height: rect.height,
        }, depth + 1);
      }
    };

    const contentBounds = trimRegion({ x: 0, y: 0, width, height }, integral, width, height);
    split(contentBounds);
    const trimmedRegions = regionsFound
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((region) => trimRegion(region, integral, width, height));
    return trimmedRegions.filter((region) => hasSubstantialContent(region, integral, width));
  };

  const createPagePreview = (image) => {
    const scale = Math.min(1, MAX_PREVIEW_EDGE / image.width, MAX_PREVIEW_EDGE / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d", { willReadFrequently: true })
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const updatePagePicker = () => {
    pagePicker.replaceChildren();
    sourcePages.forEach((page, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = page.label || `Page ${index + 1}`;
      pagePicker.append(option);
    });
    const hasMultiplePages = sourcePages.length > 1;
    pagePicker.hidden = !hasMultiplePages;
    pagePickerLabel.hidden = !hasMultiplePages;
  };

  const activatePage = async (index) => {
    const page = sourcePages[index];
    if (!page) return;
    const request = ++pageActivationRequest;
    const image = await createImageBitmap(page.blob);
    if (request !== pageActivationRequest) {
      image.close();
      return;
    }
    if (sourceImage && typeof sourceImage.close === "function") sourceImage.close();
    sourceImage = image;
    activePageIndex = index;
    preview.width = page.previewCanvas.width;
    preview.height = page.previewCanvas.height;
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(image, 0, 0, preview.width, preview.height);
    pagePicker.value = String(index);
    renderPreview();
    updateSteps();
  };

  const summarizeDetection = () => {
    if (regions.length) {
      setStatus(`Found ${regions.length} likely step${regions.length === 1 ? "" : "s"} across ${sourcePages.length} page${sourcePages.length === 1 ? "" : "s"}. Check the crops before saving.`);
    } else {
      setStatus("No panel gutters were detected. Use “Draw a crop” to select each step.");
    }
  };

  const loadImage = async (file) => {
    const supportedType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const supportedExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!supportedType && !(file.type === "" && supportedExtension)) {
      uploadStatus.textContent = "Choose a JPG, PNG, WebP image, or PDF.";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      uploadStatus.textContent = "This image is larger than 40 MB. Choose a smaller image.";
      return;
    }

    uploadStatus.textContent = "";
    setStatus("Reading image on this device…");
    try {
      const bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height) throw new Error("The image has no usable dimensions.");
      if (sourceImage && typeof sourceImage.close === "function") sourceImage.close();
      sourceFile = file;
      sourceImage = bitmap;
      const pagePreview = createPagePreview(bitmap);
      sourcePages = [{
        blob: file,
        width: bitmap.width,
        height: bitmap.height,
        previewCanvas: pagePreview,
      }];
      activePageIndex = 0;
      pageActivationRequest += 1;
      preview.width = pagePreview.width;
      preview.height = pagePreview.height;
      previewContext.drawImage(pagePreview, 0, 0);
      updatePagePicker();
      dropZone.hidden = true;
      editor.hidden = false;
      selectedStepIndexes.clear();
      regions = detectRegions(pagePreview).map((region) => ({ ...region, pageIndex: 0 }));
      summarizeDetection();
      updateSteps();
    } catch (error) {
      console.error("Could not read the selected image:", error);
      uploadStatus.textContent = error instanceof Error
        ? `Could not read this image: ${error.message}`
        : "Could not read this image. Try another file.";
      editor.hidden = true;
      dropZone.hidden = false;
    }
  };

  const loadPdf = async (file) => {
    if (file.size > MAX_FILE_SIZE) {
      uploadStatus.textContent = "This PDF is larger than 40 MB. Choose a smaller file.";
      return;
    }
    uploadStatus.textContent = "";
    setStatus("Opening PDF on this device…");
    exporting = true;
    dropZone.hidden = true;
    editor.hidden = false;
    updateSteps();

    let pdfDocument = null;
    try {
      const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "./vendor/pdfjs/pdf.worker.min.mjs",
        document.baseURI,
      ).href;
      pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      if (pdfDocument.numPages > MAX_PDF_PAGES) {
        throw new Error(`This PDF has ${pdfDocument.numPages} pages. The limit is ${MAX_PDF_PAGES} pages per file.`);
      }

      sourceFile = file;
      sourcePages = [];
      regions = [];
      selectedStepIndexes.clear();
      updatePagePicker();
      let totalPreviewPixels = 0;

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        setStatus(`Analyzing PDF page ${pageNumber} of ${pdfDocument.numPages}…`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(
          2,
          MAX_PDF_RENDER_EDGE / baseViewport.width,
          MAX_PDF_RENDER_EDGE / baseViewport.height,
        );
        const viewport = pdfPage.getViewport({ scale });
        const renderedPage = document.createElement("canvas");
        renderedPage.width = Math.max(1, Math.ceil(viewport.width));
        renderedPage.height = Math.max(1, Math.ceil(viewport.height));
        const context = renderedPage.getContext("2d", { alpha: false });
        await pdfPage.render({ canvasContext: context, viewport }).promise;

        const pageBlob = await new Promise((resolve, reject) => {
          renderedPage.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error(`Could not render PDF page ${pageNumber} to an image.`));
          }, "image/png");
        });
        const pageBitmap = await createImageBitmap(pageBlob);
        const pagePreview = createPagePreview(pageBitmap);
        pageBitmap.close();
        totalPreviewPixels += pagePreview.width * pagePreview.height;
        if (totalPreviewPixels > MAX_PDF_PREVIEW_PIXELS) {
          throw new Error("This PDF has too many large pages to process safely at once. Split it into smaller PDFs and try again.");
        }
        const pageIndex = sourcePages.length;
        sourcePages.push({
          blob: pageBlob,
          width: renderedPage.width,
          height: renderedPage.height,
          previewCanvas: pagePreview,
          label: `Page ${pageNumber}`,
        });
        regions.push(...detectRegions(pagePreview).map((region) => ({ ...region, pageIndex })));
        renderedPage.width = 0;
        renderedPage.height = 0;
        pdfPage.cleanup();
      }

      if (!sourcePages.length) throw new Error("This PDF has no pages to analyze.");
      updatePagePicker();
      await activatePage(0);
      summarizeDetection();
    } catch (error) {
      console.error("Could not analyze PDF:", error);
      sourcePages = [];
      regions = [];
      selectedStepIndexes.clear();
      editor.hidden = true;
      dropZone.hidden = false;
      uploadStatus.textContent = error instanceof Error
        ? `Could not analyze this PDF: ${error.message}`
        : "Could not analyze this PDF. Check that it is readable and not password-protected.";
    } finally {
      if (pdfDocument) await pdfDocument.destroy();
      exporting = false;
      updateSteps();
    }
  };

  const loadFile = (file) => {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      loadPdf(file);
      return;
    }
    loadImage(file);
  };

  const imageMimeType = () => {
    if (sourceFile.type === "application/pdf") return "image/png";
    if (sourceFile.type === "image/jpeg") return "image/jpeg";
    if (sourceFile.type === "image/webp") return "image/webp";
    return "image/png";
  };

  const imageExtension = () => imageMimeType() === "image/jpeg" ? "jpg"
    : imageMimeType() === "image/webp" ? "webp" : "png";

  const makeStepFileName = (index) => `step-${String(index + 1).padStart(2, "0")}.${imageExtension()}`;

  const createCropBlob = async (region) => {
    if (region.combined) {
      return region.blob;
    }
    const page = sourcePages[region.pageIndex];
    const image = await createImageBitmap(page.blob);
    try {
      const output = document.createElement("canvas");
      const scaleX = page.width / page.previewCanvas.width;
      const scaleY = page.height / page.previewCanvas.height;
      const x = Math.round(region.x * scaleX);
      const y = Math.round(region.y * scaleY);
      const width = Math.max(1, Math.round(region.width * scaleX));
      const height = Math.max(1, Math.round(region.height * scaleY));
      output.width = width;
      output.height = height;
      const context = output.getContext("2d");
      if (!context) throw new Error("Could not create an image canvas.");
      context.drawImage(image, x, y, width, height, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        output.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("The browser could not encode this image."));
        }, imageMimeType(), 0.94);
      });
      output.width = 0;
      output.height = 0;
      return blob;
    } finally {
      image.close();
    }
  };

  const createCombinedRegion = async (selectedRegions) => {
    const cropBlobs = await Promise.all(selectedRegions.map((region) => createCropBlob(region)));
    const images = await Promise.all(cropBlobs.map((blob) => createImageBitmap(blob)));
    try {
      const width = Math.max(...images.map((image) => image.width));
      const height = images.reduce((total, image) => total + image.height, 0);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a combined image canvas.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      let y = 0;
      images.forEach((image) => {
        context.drawImage(image, 0, y);
        y += image.height;
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("The browser could not encode the combined image."));
        }, imageMimeType(), 0.94);
      });
      const previewPageRegions = selectedRegions.filter(
        (region) => region.pageIndex === selectedRegions[0].pageIndex,
      );
      const selectedPreviewBounds = previewPageRegions.map(
        (region) => region.previewBounds || region,
      );
      const firstPreviewBounds = selectedPreviewBounds[0];
      const previewRegion = selectedPreviewBounds.reduce((bounds, region) => ({
        x: Math.min(bounds.x, region.x),
        y: Math.min(bounds.y, region.y),
        right: Math.max(bounds.right, region.x + region.width),
        bottom: Math.max(bounds.bottom, region.y + region.height),
      }), {
        x: firstPreviewBounds.x,
        y: firstPreviewBounds.y,
        right: firstPreviewBounds.x + firstPreviewBounds.width,
        bottom: firstPreviewBounds.y + firstPreviewBounds.height,
      });
      return {
        combined: true,
        canvas,
        blob,
        width,
        height,
        pageIndex: selectedRegions[0].pageIndex,
        previewBounds: {
          x: previewRegion.x,
          y: previewRegion.y,
          width: previewRegion.right - previewRegion.x,
          height: previewRegion.bottom - previewRegion.y,
        },
      };
    } finally {
      images.forEach((image) => image.close());
    }
  };

  const loadTesseract = () => {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoadPromise) return tesseractLoadPromise;

    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/tesseract/tesseract.min.js", document.baseURI).href;
      script.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("The offline OCR engine did not initialize."));
      };
      script.onerror = () => {
        tesseractLoadPromise = null;
        reject(new Error("Could not load the offline OCR engine."));
      };
      document.head.append(script);
    });
    return tesseractLoadPromise;
  };

  const classifyTextContent = async (blob, ocrData) => {
    const blockWords = (ocrData.blocks || [])
      .flatMap((block) => block.paragraphs || [])
      .flatMap((paragraph) => paragraph.lines || [])
      .flatMap((line) => line.words || []);
    const recognizedWords = Array.isArray(ocrData.words) && ocrData.words.length
      ? ocrData.words
      : blockWords;
    const words = recognizedWords.filter((word) => (
      word.text &&
      /[\p{L}\p{N}]/u.test(word.text) &&
      Number.isFinite(word.confidence) &&
      word.bbox
    ));
    const characterCount = words.reduce(
      (count, word) => count + (word.text.match(/[\p{L}\p{N}]/gu) || []).length,
      0,
    );
    const recognizedText = typeof ocrData.text === "string"
      ? ocrData.text
      : recognizedWords.map((word) => word.text).join(" ");
    if (!words.length || characterCount < 3) {
      return /[\p{L}\p{N}]{3}/u.test(recognizedText)
        ? { kind: "review", label: "Review" }
        : { kind: "no-text", label: "No text detected" };
    }

    const averageConfidence = words.reduce((total, word) => total + word.confidence, 0) / words.length;
    const image = await createImageBitmap(blob);
    let nonTextInkRatio;
    try {
      const scale = Math.min(1, 180 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not analyze the step image.");
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const textMask = new Uint8Array(width * height);
      const padding = Math.max(1, Math.round(Math.min(width, height) * 0.01));

      words.forEach((word) => {
        const left = Math.max(0, Math.floor(word.bbox.x0 * scale) - padding);
        const top = Math.max(0, Math.floor(word.bbox.y0 * scale) - padding);
        const right = Math.min(width, Math.ceil(word.bbox.x1 * scale) + padding);
        const bottom = Math.min(height, Math.ceil(word.bbox.y1 * scale) + padding);
        for (let y = top; y < bottom; y += 1) {
          textMask.fill(1, y * width + left, y * width + right);
        }
      });

      let nonTextInk = 0;
      for (let index = 0; index < textMask.length; index += 1) {
        if (textMask[index]) continue;
        const pixel = index * 4;
        const red = pixels[pixel];
        const green = pixels[pixel + 1];
        const blue = pixels[pixel + 2];
        const brightness = Math.max(red, green, blue);
        const chroma = brightness - Math.min(red, green, blue);
        if (brightness < 220 || (brightness < 248 && chroma > 36)) nonTextInk += 1;
      }
      nonTextInkRatio = nonTextInk / textMask.length;
    } finally {
      image.close();
    }

    if (averageConfidence < 55) return { kind: "review", label: "Review" };
    if (nonTextInkRatio <= 0.003) return { kind: "text-only", label: "Text only" };
    if (nonTextInkRatio >= 0.035) return { kind: "text-and-graphics", label: "Text + graphics" };
    return { kind: "review", label: "Review" };
  };

  const prepareOcrBlob = async (blob) => {
    const image = await createImageBitmap(blob);
    try {
      const scale = Math.min(3, 1200 / Math.max(image.width, image.height));
      if (scale <= 1) return blob;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the image for text recognition.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Could not prepare the image for text recognition."));
        }, "image/png");
      });
    } finally {
      image.close();
    }
  };

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const runMenuCommand = (button, action) => {
    button.addEventListener("click", () => {
      action();
      button.closest("details").open = false;
    });
  };

  toolbarOpenButton.addEventListener("click", () => fileInput.click());
  toolbarDetectButton.addEventListener("click", () => redetectButton.click());
  toolbarCropButton.addEventListener("click", () => drawButton.click());
  toolbarExportButton.addEventListener("click", () => downloadAllButton.click());

  runMenuCommand(menuOpenButton, () => fileInput.click());
  runMenuCommand(menuCloseFileButton, () => replaceButton.click());
  runMenuCommand(menuExportButton, () => downloadAllButton.click());
  runMenuCommand(menuDetectButton, () => redetectButton.click());
  runMenuCommand(menuDrawButton, () => drawButton.click());

  const isAppInstalled = () => window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isAppInstalled()) return;
    deferredInstallPrompt = event;
    installAppButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
  });

  installAppButton.addEventListener("click", async () => {
    const installPrompt = deferredInstallPrompt;
    if (!installPrompt) return;
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.error("Could not open the app installation prompt:", error);
      const message = "Could not open the install prompt. Use your browser menu to install StepSplit.";
      if (editor.hidden) uploadStatus.textContent = message;
      else setStatus(message, true);
    }
  });

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const makeZip = (entries) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const write16 = (view, position, value) => view.setUint16(position, value, true);
    const write32 = (view, position, value) => view.setUint32(position, value, true);

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.data;
      const checksum = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      write32(localView, 0, 0x04034b50);
      write16(localView, 4, 20);
      write16(localView, 6, 0x0800);
      write32(localView, 14, checksum);
      write32(localView, 18, data.length);
      write32(localView, 22, data.length);
      write16(localView, 26, name.length);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      write32(centralView, 0, 0x02014b50);
      write16(centralView, 4, 20);
      write16(centralView, 6, 20);
      write16(centralView, 8, 0x0800);
      write32(centralView, 16, checksum);
      write32(centralView, 20, data.length);
      write32(centralView, 24, data.length);
      write16(centralView, 28, name.length);
      write32(centralView, 42, offset);
      central.set(name, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    }

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    write32(endView, 0, 0x06054b50);
    write16(endView, 8, entries.length);
    write16(endView, 10, entries.length);
    write32(endView, 12, centralSize);
    write32(endView, 16, offset);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  };

  browseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener("click", (event) => {
    if (event.target !== browseButton) fileInput.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) loadFile(file);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  const reset = () => {
    if (sourceImage && typeof sourceImage.close === "function") sourceImage.close();
    sourceImage = null;
    sourceFile = null;
    sourcePages = [];
    activePageIndex = 0;
    pageActivationRequest += 1;
    regions = [];
    selectedStepIndexes.clear();
    drawing = false;
    dropZone.hidden = false;
    editor.hidden = true;
    uploadStatus.textContent = "";
    statusMessage.textContent = "";
    drawButton.classList.remove("is-active");
    drawButton.setAttribute("aria-pressed", "false");
    drawHint.hidden = true;
    pagePicker.replaceChildren();
    pagePicker.hidden = true;
    pagePickerLabel.hidden = true;
    exporting = false;
    preview.width = 1;
    preview.height = 1;
    updateSteps();
  };

  replaceButton.addEventListener("click", reset);
  pagePicker.addEventListener("change", () => {
    drawing = false;
    drawButton.classList.remove("is-active");
    drawButton.setAttribute("aria-pressed", "false");
    drawHint.hidden = true;
    preview.classList.remove("is-drawing");
    activatePage(Number(pagePicker.value)).catch((error) => {
      console.error("Could not display the selected page:", error);
      setStatus("Could not display that page. Try selecting it again.", true);
    });
  });

  redetectButton.addEventListener("click", async () => {
    if (!sourcePages.length || exporting) return;
    exporting = true;
    updateSteps();
    regions = [];
    selectedStepIndexes.clear();
    try {
      for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
        setStatus(`Detecting panels on page ${pageIndex + 1} of ${sourcePages.length}…`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        regions.push(...detectRegions(sourcePages[pageIndex].previewCanvas)
          .map((region) => ({ ...region, pageIndex })));
      }
      summarizeDetection();
    } catch (error) {
      console.error("Could not detect panels:", error);
      setStatus("Could not analyze the pages. Try a smaller or clearer file.", true);
    } finally {
      exporting = false;
      updateSteps();
    }
  });

  drawButton.setAttribute("aria-pressed", "false");
  drawButton.addEventListener("click", () => {
    drawing = !drawing;
    drawButton.classList.toggle("is-active", drawing);
    drawButton.setAttribute("aria-pressed", String(drawing));
    drawHint.hidden = !drawing;
    preview.classList.toggle("is-drawing", drawing);
    setStatus(drawing ? "Drag over a panel in the image to add a step." : "");
  });

  const pointFromEvent = (event) => {
    const bounds = preview.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(preview.width, (event.clientX - bounds.left) * preview.width / bounds.width)),
      y: Math.max(0, Math.min(preview.height, (event.clientY - bounds.top) * preview.height / bounds.height)),
    };
  };
  preview.addEventListener("pointerdown", (event) => {
    if (!drawing || !sourceImage || exporting) return;
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    drawStart = pointFromEvent(event);
    drawEnd = drawStart;
    renderPreview();
  });
  preview.addEventListener("pointermove", (event) => {
    if (!drawStart) return;
    drawEnd = pointFromEvent(event);
    renderPreview();
  });
  preview.addEventListener("pointerup", (event) => {
    if (!drawStart || !drawEnd) return;
    drawEnd = pointFromEvent(event);
    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const width = Math.abs(drawEnd.x - drawStart.x);
    const height = Math.abs(drawEnd.y - drawStart.y);
    drawStart = null;
    drawEnd = null;
    if (width >= 24 && height >= 24 && regions.length < 240) {
      const page = sourcePages[activePageIndex];
      const { width: canvasWidth, height: canvasHeight } = page.previewCanvas;
      const imageData = page.previewCanvas.getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, canvasWidth, canvasHeight);
      const integral = activePixelIntegral(imageData, canvasWidth, canvasHeight);
      regions.push(trimRegion(
        { x, y, width, height, pageIndex: activePageIndex, manual: true },
        integral,
        canvasWidth,
        canvasHeight,
      ));
      setStatus("Added a step crop.");
      updateSteps();
    } else {
      setStatus("Drag a larger rectangle to add a step.", true);
      renderPreview();
    }
  });
  preview.addEventListener("pointercancel", () => {
    drawStart = null;
    drawEnd = null;
    renderPreview();
  });

  textDetectButton.addEventListener("click", async () => {
    if (!regions.length || exporting) return;
    exporting = true;
    textAnalyzing = true;
    updateSteps();
    setStatus("Loading the on-device English text recognizer…");
    let worker = null;
    let currentStep = 0;
    try {
      const tesseract = await loadTesseract();
      worker = await tesseract.createWorker("eng", 1, {
        workerPath: new URL("./vendor/tesseract/worker.min.js", document.baseURI).href,
        corePath: new URL("./vendor/tesseract/core/", document.baseURI).href,
        langPath: new URL("./vendor/tesseract/lang", document.baseURI).href,
        workerBlobURL: false,
        cacheMethod: "write",
        gzip: true,
        logger: (message) => {
          if (!message.status || !Number.isFinite(message.progress)) return;
          const progress = Math.round(message.progress * 100);
          const stepStatus = currentStep ? `Step ${currentStep} of ${regions.length}: ` : "";
          setStatus(`${stepStatus}${message.status} (${progress}%).`);
        },
      });

      const classifications = [];
      for (let index = 0; index < regions.length; index += 1) {
        currentStep = index + 1;
        setStatus(`Checking text in step ${currentStep} of ${regions.length}…`);
        const blob = await createCropBlob(regions[index]);
        const ocrBlob = await prepareOcrBlob(blob);
        const { data } = await worker.recognize(ocrBlob, {}, { blocks: true });
        classifications.push(await classifyTextContent(ocrBlob, data));
      }

      regions.forEach((region, index) => {
        region.textClassification = classifications[index];
      });
      const textOnlyCount = classifications.filter((classification) => classification.kind === "text-only").length;
      setStatus(`Identified ${textOnlyCount} likely text-only block${textOnlyCount === 1 ? "" : "s"} out of ${regions.length}.`);
    } catch (error) {
      console.error("Could not identify text-only steps:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : error && typeof error === "object" && typeof error.message === "string"
          ? error.message
          : typeof error === "string"
            ? error
            : "The OCR worker failed without a detailed message.";
      setStatus(`Could not identify text-only steps: ${errorMessage}`, true);
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error("Could not stop the text recognizer:", error);
          setStatus("Text recognition finished, but the OCR worker could not be stopped cleanly.", true);
        }
      }
      exporting = false;
      textAnalyzing = false;
      updateSteps();
    }
  });

  combineButton.addEventListener("click", async () => {
    if (selectedStepIndexes.size < 2 || exporting) return;
    exporting = true;
    updateSteps();
    setStatus("Combining selected steps…");
    try {
      const indexes = [...selectedStepIndexes].sort((a, b) => a - b);
      const selectedRegions = indexes.map((index) => regions[index]);
      const combinedRegion = await createCombinedRegion(selectedRegions);
      for (let offset = indexes.length - 1; offset >= 0; offset -= 1) {
        regions.splice(indexes[offset], 1);
      }
      regions.splice(indexes[0], 0, combinedRegion);
      selectedStepIndexes.clear();
      setStatus(`Combined ${indexes.length} steps into one block at position ${indexes[0] + 1}. Blocks are reordered afterward.`);
      if (combinedRegion.pageIndex !== activePageIndex) {
        await activatePage(combinedRegion.pageIndex);
      }
      renderPreview();
    } catch (error) {
      console.error("Could not combine selected steps:", error);
      setStatus("Could not combine the selected steps.", true);
    } finally {
      exporting = false;
      updateSteps();
    }
  });

  mergeTextOnlyButton.addEventListener("click", async () => {
    const indexes = getTextOnlyMergeIndexes();
    if (!indexes.length || exporting) return;
    exporting = true;
    selectedStepIndexes.clear();
    updateSteps();
    setStatus(`Merging ${indexes.length} text-only block${indexes.length === 1 ? "" : "s"} with the block below…`);
    try {
      const combinedRegions = [];
      for (const index of indexes) {
        combinedRegions.push(await createCombinedRegion([regions[index], regions[index + 1]]));
      }
      for (let offset = indexes.length - 1; offset >= 0; offset -= 1) {
        regions.splice(indexes[offset], 2, combinedRegions[offset]);
      }
      if (combinedRegions[0].pageIndex !== activePageIndex) {
        await activatePage(combinedRegions[0].pageIndex);
      }
      setStatus(`Merged ${indexes.length} text-only block${indexes.length === 1 ? "" : "s"} with the next block, starting from step 3.`);
    } catch (error) {
      console.error("Could not merge text-only blocks:", error);
      setStatus("Could not merge the text-only blocks with the next steps.", true);
    } finally {
      exporting = false;
      updateSteps();
    }
  });

  downloadAllButton.addEventListener("click", async () => {
    if (!regions.length || exporting) return;
    exporting = true;
    updateSteps();
    setStatus("Preparing your step images…");
    try {
      const entries = [];
      for (let index = 0; index < regions.length; index += 1) {
        const blob = await createCropBlob(regions[index]);
        entries.push({
          name: makeStepFileName(index),
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      saveBlob(makeZip(entries), "steps.zip");
      setStatus(`Saved ${entries.length} step images in steps.zip.`);
    } catch (error) {
      console.error("Could not export step images:", error);
      setStatus("Could not create the ZIP. Try saving the steps individually.", true);
    } finally {
      exporting = false;
      updateSteps();
    }
  });

  if (
    "serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Could not register the offline app:", error);
    });
  }

  updateSteps();
})();
