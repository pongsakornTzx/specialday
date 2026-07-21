// App State
let billsData = {};
let currentRoundKey = '';
let searchFilter = '';
let activeRoundData = null;
let editingCustomerName = null; // Track which customer is currently being renamed inline
let selectedScanFile = null; // Track file selected for AI Scan

const defaultPaymentInfo = {
    bank: 'โอนค่าใช้จ่ายบัญชี SCB',
    acc_num: '271-2-51047-4',
    acc_name: 'พงศกร'
};
let paymentInfo = { ...defaultPaymentInfo };

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    updateSidebarPaymentInfo();
    initDashboard();
    setupEventListeners();
    setupImageUpload();
});

// Load data from LocalStorage or fallback to data.js
function loadData() {
    const localData = localStorage.getItem('SPECIALDAY_BILLS_DATA');
    if (localData) {
        try {
            billsData = JSON.parse(localData);
            console.log('Loaded data from localStorage.');
        } catch (e) {
            console.error('Error parsing data from localStorage, falling back to INITIAL_BILLS_DATA', e);
            billsData = window.INITIAL_BILLS_DATA || {};
        }
    } else {
        billsData = window.INITIAL_BILLS_DATA || {};
        saveToLocalStorage();
        console.log('Initialized data from INITIAL_BILLS_DATA.');
    }

    const localPayment = localStorage.getItem('SPECIALDAY_PAYMENT_INFO');
    if (localPayment) {
        try {
            paymentInfo = JSON.parse(localPayment);
        } catch (e) {
            console.error('Error parsing payment info', e);
            paymentInfo = { ...defaultPaymentInfo };
        }
    } else {
        paymentInfo = { ...defaultPaymentInfo };
        savePaymentInfo();
    }
}

// Save active state to LocalStorage
function saveToLocalStorage() {
    localStorage.setItem('SPECIALDAY_BILLS_DATA', JSON.stringify(billsData));
}

function savePaymentInfo() {
    localStorage.setItem('SPECIALDAY_PAYMENT_INFO', JSON.stringify(paymentInfo));
}

function updateSidebarPaymentInfo() {
    document.getElementById('sidebarBankText').innerText = paymentInfo.bank;
    document.getElementById('sidebarAccNumText').innerHTML = `<i class="fa-solid fa-credit-card"></i> ${paymentInfo.acc_num}`;
    document.getElementById('sidebarAccNameText').innerText = paymentInfo.acc_name;
}

// Setup Dashboard Navigation and Sidebar
function initDashboard() {
    const sortedRoundKeys = Object.keys(billsData).sort((a, b) => {
        const getSortVal = (key) => {
            const dd = parseInt(key.substring(0, 2)) || 1;
            const mm = parseInt(key.substring(2, 4)) || 1;
            const yy = parseInt(key.substring(4, 6)) || 0;
            return yy * 10000 + mm * 100 + dd;
        };
        // Sort descending (latest first)
        return getSortVal(b) - getSortVal(a);
    });

    const roundListContainer = document.getElementById('roundList');
    roundListContainer.innerHTML = '';

    if (sortedRoundKeys.length === 0) {
        roundListContainer.innerHTML = '<div style="padding:1rem;color:var(--text-muted);font-size:0.8rem;text-align:center;">ไม่มีรอบบิลในระบบ</div>';
        currentRoundKey = '';
        activeRoundData = null;
        updateStatsEmpty();
        renderCustomersEmpty();
        return;
    }

    if (!currentRoundKey || !billsData[currentRoundKey]) {
        currentRoundKey = sortedRoundKeys[0];
    }

    sortedRoundKeys.forEach((key) => {
        const round = billsData[key];
        const roundItem = document.createElement('div');
        roundItem.className = 'round-item';
        if (key === currentRoundKey) {
            roundItem.className += ' active';
        }

        const billsCount = round.bills ? round.bills.length : 0;
        const totalNet = round.bills ? round.bills.reduce((sum, bill) => sum + (bill.after_discount || 0), 0) : 0;

        roundItem.innerHTML = `
            <div class="round-item-title">รอบ ${round.round_date}</div>
            <div class="round-item-meta">
                <span>${billsCount} รายการ</span>
                <span>${formatNumber(totalNet)} บ.</span>
            </div>
        `;

        roundItem.addEventListener('click', () => {
            document.querySelectorAll('.round-item').forEach(el => el.classList.remove('active'));
            roundItem.classList.add('active');
            selectRound(key);
        });

        roundListContainer.appendChild(roundItem);
    });

    populateNameSuggestions();
    selectRound(currentRoundKey);
}

// Populate datalist suggestion for form autocomplete
function populateNameSuggestions() {
    const names = new Set();
    Object.values(billsData).forEach(round => {
        if (round.bills) {
            round.bills.forEach(bill => {
                if (bill.base_name) names.add(bill.base_name);
            });
        }
    });

    const suggestions = document.getElementById('nameSuggestions');
    if (suggestions) {
        suggestions.innerHTML = '';
        Array.from(names).sort().forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            suggestions.appendChild(option);
        });
    }
}

// Setup Event Listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const exportAllSummaryBtn = document.getElementById('exportAllSummaryBtn');
    
    // Search Inputs
    searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value.trim().toLowerCase();
        clearSearchBtn.style.display = searchFilter ? 'block' : 'none';
        renderCustomers();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchFilter = '';
        clearSearchBtn.style.display = 'none';
        renderCustomers();
    });

    // Export All Summary
    exportAllSummaryBtn.addEventListener('click', () => {
        copyRoundSummaryText();
    });

    // Sidebar: Add New Round Modal Trigger
    document.getElementById('openAddRoundModalBtn').addEventListener('click', () => {
        document.getElementById('roundForm').reset();
        resetImageUpload();
        openModal('roundModal');
        document.getElementById('roundModalTitle').innerText = 'เพิ่มรอบบิลใหม่';
    });

    // Sidebar: Settings Modal Trigger
    document.getElementById('openSettingsModalBtn').addEventListener('click', () => {
        const savedKey = localStorage.getItem('GEMINI_API_KEY') || '';
        document.getElementById('geminiApiKeyInput').value = savedKey;
        openModal('settingsModal');
    });

    // Sidebar: Download data.js
    document.getElementById('downloadBackupBtn').addEventListener('click', () => {
        downloadBackupData();
    });

    // Content: Add New Bill Modal Trigger
    document.getElementById('openAddBillModalBtn').addEventListener('click', () => {
        openAddBillModal();
    });

    // Content: Delete Round Trigger
    document.getElementById('deleteRoundBtn').addEventListener('click', () => {
        deleteActiveRound();
    });

    // Sidebar: Edit Payment Info Modal Trigger
    document.getElementById('openPaymentModalBtn').addEventListener('click', () => {
        document.getElementById('paymentBankInput').value = paymentInfo.bank;
        document.getElementById('paymentAccNumInput').value = paymentInfo.acc_num;
        document.getElementById('paymentAccNameInput').value = paymentInfo.acc_name;
        openModal('paymentModal');
    });

    // Forms submission handlers
    document.getElementById('roundForm').addEventListener('submit', handleRoundSubmit);
    document.getElementById('billForm').addEventListener('submit', handleBillSubmit);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
    
    // AI Scan Button click handler
    document.getElementById('aiScanBtn').addEventListener('click', handleAIScan);
    
    // Confirm Scan Import
    document.getElementById('confirmScanImportBtn').addEventListener('click', handleConfirmScanImport);

    // Auto calculate discount input listener
    const beforeInput = document.getElementById('billBeforeInput');
    const afterInput = document.getElementById('billAfterInput');
    const autoCalcCheckbox = document.getElementById('autoCalcDiscount');

    beforeInput.addEventListener('input', () => {
        if (autoCalcCheckbox.checked) {
            const beforeVal = parseFloat(beforeInput.value) || 0;
            afterInput.value = (beforeVal * 0.8).toFixed(2);
        }
    });

    autoCalcCheckbox.addEventListener('change', () => {
        if (autoCalcCheckbox.checked) {
            const beforeVal = parseFloat(beforeInput.value) || 0;
            afterInput.value = (beforeVal * 0.8).toFixed(2);
            afterInput.readOnly = true;
        } else {
            afterInput.readOnly = false;
        }
    });

    // Mobile Navigation Drawer Event Listeners
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    document.getElementById('mobileMenuToggle').addEventListener('click', () => {
        sidebar.classList.add('show-drawer');
        sidebarOverlay.classList.add('show');
    });

    document.getElementById('closeSidebarBtn').addEventListener('click', () => {
        sidebar.classList.remove('show-drawer');
        sidebarOverlay.classList.remove('show');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('show-drawer');
        sidebarOverlay.classList.remove('show');
    });

    document.getElementById('mobileSettingsToggle').addEventListener('click', () => {
        const savedKey = localStorage.getItem('GEMINI_API_KEY') || '';
        document.getElementById('geminiApiKeyInput').value = savedKey;
        openModal('settingsModal');
    });
}

// Setup Drag & Drop Image Uploader
function setupImageUpload() {
    const dropzone = document.getElementById('uploadDropzone');
    const imageInput = document.getElementById('imageInput');
    const removeImageBtn = document.getElementById('removeImageBtn');

    // Drag events
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        }, false);
    });

    // Handle dropped file
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleSelectedImage(files[0]);
        }
    });

    // Handle file selection
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSelectedImage(e.target.files[0]);
        }
    });

    // Remove selected image
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetImageUpload();
    });
}

// Display selected image and toggle buttons
function handleSelectedImage(file) {
    const isImageMime = file.type && file.type.startsWith('image/');
    const extension = file.name ? file.name.split('.').pop().toLowerCase() : '';
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'];
    const isImageExt = validExtensions.includes(extension);

    if (!isImageMime && !isImageExt) {
        showToast('กรุณาเลือกเฉพาะไฟล์รูปภาพเท่านั้น', true);
        return;
    }

    selectedScanFile = file;

    const isHEIC = extension === 'heic' || extension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';

    if (isHEIC) {
        // Display a nice placeholder icon for HEIC files since browser can't render it directly
        document.getElementById('imagePreview').src = '';
        document.getElementById('imagePreview').style.display = 'none';
        
        let placeholder = document.getElementById('heicPlaceholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.id = 'heicPlaceholder';
            placeholder.className = 'heic-placeholder-box';
            document.getElementById('imagePreviewContainer').insertBefore(placeholder, document.getElementById('imagePreview'));
        }
        placeholder.style.display = 'block';
        placeholder.innerHTML = `
            <i class="fa-solid fa-file-image" style="font-size: 3rem; color: var(--color-primary); margin-bottom: 0.5rem;"></i>
            <div style="font-size: 0.8rem; color: #ffffff; word-break: break-all; padding: 0 1rem;">${file.name}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">(รูปภาพ HEIC จาก iPhone - สามารถส่งสแกน AI ได้ทันที)</div>
        `;
        
        document.getElementById('imagePreviewContainer').style.display = 'block';
        document.getElementById('uploadDropzone').style.display = 'none';
        document.getElementById('aiScanBtn').style.display = 'flex';
        document.getElementById('saveRoundBtn').style.display = 'none';
    } else {
        // Normal image preview
        const placeholder = document.getElementById('heicPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        
        document.getElementById('imagePreview').style.display = 'inline-block';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreviewContainer').style.display = 'block';
            document.getElementById('uploadDropzone').style.display = 'none';
            document.getElementById('aiScanBtn').style.display = 'flex';
            document.getElementById('saveRoundBtn').style.display = 'none'; // Hide manual save round
        };
        reader.readAsDataURL(file);
    }
}

// Reset Image Uploader state
function resetImageUpload() {
    selectedScanFile = null;
    document.getElementById('imageInput').value = '';
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    
    const placeholder = document.getElementById('heicPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    
    document.getElementById('uploadDropzone').style.display = 'flex';
    document.getElementById('aiScanBtn').style.display = 'none';
    document.getElementById('saveRoundBtn').style.display = 'inline-flex'; // Show manual save round
}

// Helper: Convert File to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

// Handle AI Scan button click
async function handleAIScan() {
    if (!selectedScanFile) return;

    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
        showToast('กรุณากรอกและบันทึก Gemini API Key ก่อนใช้งานระบบสแกน', true);
        closeModal('roundModal');
        openModal('settingsModal');
        return;
    }

    const aiScanBtn = document.getElementById('aiScanBtn');
    const originalBtnHtml = aiScanBtn.innerHTML;

    // Show loading state
    aiScanBtn.disabled = true;
    aiScanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังวิเคราะห์ภาพถ่ายลายมือ...';

    try {
        const base64Image = await fileToBase64(selectedScanFile);
        
        // Construct API endpoint using gemini-flash-latest
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
        
        const prompt = `วิเคราะห์ภาพถ่ายกระดาษเขียนลายมือสรุปค่าใช้จ่ายนี้ 
และสกัดข้อมูลออกมาเป็นรูปแบบ JSON ตามโครงสร้างที่กำหนดเท่านั้น:

เงื่อนไขการสกัดข้อมูล:
1. นำเข้ารายการบิลปกติสรุปด้านบนอย่างเดียว (ที่อยู่เหนือเส้นคั่นกลางกระดาษ)
   ตัวอย่างรายการด้านบน เช่น:
   - พี่ยุ 750 (คำนวณยอดจ่ายหักลด 20% ด้วย: 750 * 0.8 = 600)
   - พี่ตา 400 (ยอดจ่าย 400 * 0.8 = 320)
   - พี่อบ 950 - 50 (ยอดเต็ม 950, ยอดจ่ายหักลดและลบหมายเหตุ 50: 950*0.8 - 50 = 710 บาท หรือคำนวณตามจริง)
   - พี่เอ 600 (ยอดจ่าย 600 * 0.8 = 480)
   - พี่จา 700 (ยอดจ่าย 700 * 0.8 = 560)
   - นัน1 320 (ยอดจ่าย 320 * 0.8 = 256)
   - นัน2 580 (ยอดจ่าย 580 * 0.8 = 464)
2. ห้ามนำข้อมูลรายละเอียดส่วนด้านล่างใต้เส้นแบ่งสีแดง (ที่เป็นพวกยอดหวยเคลียร์งวดเก่า) เข้ามาในตารางบิลย่อยเด็ดขาด
3. แปลงวันที่ในรูป เช่น "1/7/69" เป็นรูปแบบ วัน/เดือน/ปีพุทธศักราชเต็ม เช่น "01/07/2569" (โดย 69 คือปี 2569)
4. คำนวณส่วนลด 20% สำหรับยอดจ่าย (after_discount) ให้โดยอัตโนมัติ (after_discount = before_discount * 0.8) เว้นแต่มีหมายเหตุยอดหักลบที่ชัดเจน

โครงสร้าง JSON ที่ต้องส่งกลับ (ห้ามเขียนคำบรรยายอธิบายใดๆ นอกเหนือจาก JSON):
{
  "round_date": "DD/MM/YYYY",
  "bills": [
    {
      "original_name": "ชื่อผู้ซื้อ/ชื่อรายการ (เช่น พี่ยุ, พี่ตา, พี่อบ, นัน1)",
      "before_discount": 750,
      "after_discount": 600,
      "note": "ข้อความหมายเหตุ (ถ้ามี)"
    }
  ]
}`;

        let mimeType = selectedScanFile.type;
        if (!mimeType) {
            const extension = selectedScanFile.name ? selectedScanFile.name.split('.').pop().toLowerCase() : '';
            if (extension === 'png') {
                mimeType = 'image/png';
            } else if (extension === 'webp') {
                mimeType = 'image/webp';
            } else if (extension === 'heic') {
                mimeType = 'image/heic';
            } else if (extension === 'heif') {
                mimeType = 'image/heif';
            } else {
                mimeType = 'image/jpeg';
            }
        }

        const payload = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const responseData = await response.json();
        const jsonText = responseData.candidates[0].content.parts[0].text;
        const parsedResult = JSON.parse(jsonText);

        // Success! Populate verification preview modal
        showToast('วิเคราะห์รูปภาพสำเร็จ! โปรดตรวจสอบข้อมูลก่อนนำเข้า');
        closeModal('roundModal');
        openScanPreview(parsedResult);

    } catch (err) {
        console.error('Gemini API Error: ', err);
        showToast('เกิดข้อผิดพลาดในการเรียกระบบสแกน AI หรือรหัส API Key ไม่ถูกต้อง', true);
    } finally {
        // Restore button state
        aiScanBtn.disabled = false;
        aiScanBtn.innerHTML = originalBtnHtml;
    }
}

// Open Scan Preview Modal and render editable rows
function openScanPreview(data) {
    document.getElementById('scannedRoundDate').value = data.round_date || '';
    
    const body = document.getElementById('scannedBillsBody');
    body.innerHTML = '';

    const bills = data.bills || [];
    bills.forEach((bill, idx) => {
        appendScannedRowHTML(bill.original_name, bill.before_discount, bill.after_discount, bill.note);
    });

    openModal('scanPreviewModal');
}

// Append HTML Row in Scan Preview Table
function appendScannedRowHTML(name = '', before = 0, after = 0, note = '') {
    const body = document.getElementById('scannedBillsBody');
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
        <td><input type="text" class="preview-table-input scan-bill-name" value="${name}" placeholder="ชื่อลูกค้า/รายการ"></td>
        <td><input type="number" step="0.01" class="preview-table-input scan-bill-before" value="${before}" placeholder="0.00"></td>
        <td><input type="number" step="0.01" class="preview-table-input scan-bill-after" value="${after}" placeholder="0.00"></td>
        <td><input type="text" class="preview-table-input scan-bill-note" value="${note}" placeholder="-"></td>
        <td style="text-align: center;">
            <button type="button" class="row-action-btn delete" onclick="this.closest('tr').remove()" title="ลบแถว">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </td>
    `;
    
    // Auto-calculate discount 20% on changing before_discount input
    const beforeInput = tr.querySelector('.scan-bill-before');
    const afterInput = tr.querySelector('.scan-bill-after');
    
    beforeInput.addEventListener('input', () => {
        const val = parseFloat(beforeInput.value) || 0;
        afterInput.value = (val * 0.8).toFixed(2);
    });

    body.appendChild(tr);
}

// Expose add row to window
window.addScannedRow = function() {
    appendScannedRowHTML();
};

// Confirm and import scanned data to active list
function handleConfirmScanImport() {
    const dateInput = document.getElementById('scannedRoundDate').value.trim();
    
    // Validate Date format
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(dateInput)) {
        showToast('กรุณากรอกวันที่รูปแบบ วัน/เดือน/ปีพุทธศักราช (เช่น 01/07/2569)', true);
        return;
    }

    // Read Table Rows data
    const rows = document.querySelectorAll('#scannedBillsBody tr');
    const billsList = [];

    let hasError = false;

    rows.forEach(tr => {
        const name = tr.querySelector('.scan-bill-name').value.trim();
        const before = parseFloat(tr.querySelector('.scan-bill-before').value) || 0;
        const after = parseFloat(tr.querySelector('.scan-bill-after').value) || 0;
        const note = tr.querySelector('.scan-bill-note').value.trim();

        if (!name) {
            hasError = true;
            tr.querySelector('.scan-bill-name').style.borderColor = 'red';
            return;
        }

        billsList.push({
            original_name: name,
            base_name: cleanBaseName(name),
            before_discount: before,
            after_discount: after,
            note: note,
            status: 'รอโอน'
        });
    });

    if (hasError) {
        showToast('กรุณากรอกชื่อลูกค้า/ชื่อบิลย่อยให้ครบถ้วน', true);
        return;
    }

    const match = dateInput.match(dateRegex);
    const dd = match[1];
    const mm = match[2];
    const yyyy = match[3];
    const yy = yyyy.substring(2, 4);
    const key = `${dd}${mm}${yy}`;

    // Overwrite or create new round
    billsData[key] = {
        sheet_name: key,
        round_date: dateInput,
        bills: billsList
    };

    saveToLocalStorage();
    closeModal('scanPreviewModal');
    showToast(`นำเข้าข้อมูลรอบ ${dateInput} เรียบร้อยแล้ว!`);
    
    currentRoundKey = key;
    initDashboard();
}

// Select round and update view
function selectRound(key) {
    currentRoundKey = key;
    activeRoundData = billsData[key];
    
    if (!activeRoundData) {
        updateStatsEmpty();
        renderCustomersEmpty();
        return;
    }

    document.getElementById('activeRoundDateText').innerText = `รอบวันที่ ${activeRoundData.round_date}`;
    document.getElementById('currentRoundTitle').innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> รอบ ${activeRoundData.round_date}`;
    
    calculateStats();
    renderCustomers();
    editingCustomerName = null;

    // Close sidebar drawer on mobile after selection
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('show-drawer')) {
        sidebar.classList.remove('show-drawer');
        overlay.classList.remove('show');
    }
}

// Update Stats UI when there is no data
function updateStatsEmpty() {
    document.getElementById('activeRoundDateText').innerText = 'ไม่พบรอบบิล';
    document.getElementById('currentRoundTitle').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ไม่พบข้อมูล';
    document.getElementById('statTotalBefore').innerHTML = `0.00 <span class="unit">บาท</span>`;
    document.getElementById('statTotalDiscount').innerHTML = `0.00 <span class="unit">บาท</span>`;
    document.getElementById('statTotalAfter').innerHTML = `0.00 <span class="unit">บาท</span>`;
    document.getElementById('statTotalCustomers').innerHTML = `0 <span class="unit">คน</span>`;
    document.getElementById('billCountBadge').innerText = '0 บิล';
}

// Empty screen state
function renderCustomersEmpty() {
    document.getElementById('customerGrid').innerHTML = `
        <div class="glass-card" style="grid-column: span 2; padding: 4rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-receipt" style="font-size: 3rem; margin-bottom: 1.2rem; color: rgba(255,255,255,0.05)"></i>
            <h3>ยังไม่มีข้อมูลค่าใช้จ่ายสำหรับรอบนี้</h3>
            <p style="font-size:0.85rem;margin-top:0.5rem;color:var(--text-muted);">กดปุ่ม "เพิ่มบิลย่อย" เพื่อเริ่มกรอกรายการเงิน</p>
        </div>
    `;
}

// Calculate stats for overview cards
function calculateStats() {
    if (!activeRoundData || !activeRoundData.bills) return;
    
    const bills = activeRoundData.bills;
    const totalBefore = bills.reduce((sum, b) => sum + (b.before_discount || 0), 0);
    const totalAfter = bills.reduce((sum, b) => sum + (b.after_discount || 0), 0);
    const totalDiscount = totalBefore - totalAfter;
    
    const uniqueCustomers = new Set(bills.map(b => b.base_name)).size;
    
    document.getElementById('statTotalBefore').innerHTML = `${formatNumber(totalBefore)} <span class="unit">บาท</span>`;
    document.getElementById('statTotalDiscount').innerHTML = `${formatNumber(totalDiscount)} <span class="unit">บาท</span>`;
    document.getElementById('statTotalAfter').innerHTML = `${formatNumber(totalAfter)} <span class="unit">บาท</span>`;
    document.getElementById('statTotalCustomers').innerHTML = `${uniqueCustomers} <span class="unit">คน</span>`;
    document.getElementById('billCountBadge').innerText = `${bills.length} บิล`;
}

// Group bills by base customer name
function groupBillsByCustomer(bills) {
    const grouped = {};
    if (!bills) return [];

    bills.forEach((bill, originalIndex) => {
        const base = bill.base_name || cleanBaseName(bill.original_name);
        if (!grouped[base]) {
            grouped[base] = {
                name: base,
                bills: [],
                totalBefore: 0,
                totalAfter: 0,
                status: 'pending'
            };
        }
        
        const billWithIdx = { ...bill, originalIndex };
        
        grouped[base].bills.push(billWithIdx);
        grouped[base].totalBefore += (bill.before_discount || 0);
        grouped[base].totalAfter += (bill.after_discount || 0);
    });

    Object.values(grouped).forEach(cust => {
        if (cust.totalAfter <= 0) {
            cust.status = 'none'; // ไม่มีค่าใช้จ่าย (หักลบ)
        } else {
            const hasPending = cust.bills.some(b => b.status === 'รอโอน' || !b.status);
            if (hasPending) {
                cust.status = 'pending'; // ค้างชำระ
            } else {
                cust.status = 'paid'; // ชำระแล้ว
            }
        }
    });

    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

// Helper: Clean base name from bill name (e.g. "พี่อบ2" -> "พี่อบ")
function cleanBaseName(name) {
    if (!name) return "";
    let str = String(name).trim();
    let base = str.replace(/[\s\d\-]+(\(วิ่ง\))?$/, '');
    base = base.replace(/[\s\d\-]+$/, '');
    base = base.replace(/\(วิ่ง\)/, '').trim();
    return base;
}

// Render main Customer statement card lists
function renderCustomers() {
    const grid = document.getElementById('customerGrid');
    grid.innerHTML = '';
    
    if (!activeRoundData || !activeRoundData.bills || activeRoundData.bills.length === 0) {
        renderCustomersEmpty();
        return;
    }

    const customers = groupBillsByCustomer(activeRoundData.bills);
    
    const filteredCustomers = customers.filter(cust => {
        return cust.name.toLowerCase().includes(searchFilter) || 
               cust.bills.some(b => b.original_name.toLowerCase().includes(searchFilter));
    });

    if (filteredCustomers.length === 0) {
        grid.innerHTML = `
            <div class="glass-card" style="grid-column: span 2; padding: 3rem; text-align: center; color: var(--text-muted);">
                <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: rgba(255,255,255,0.1)"></i>
                <p>ไม่พบรายชื่อผู้ชำระเงินตามเงื่อนไขที่ค้นหา</p>
            </div>
        `;
        return;
    }

    filteredCustomers.forEach(cust => {
        const card = document.createElement('div');
        card.className = 'customer-card glass-card';

        let statusBadge = '';
        if (cust.status === 'paid') {
            statusBadge = '<span class="badge badge-paid">ชำระแล้ว</span>';
        } else if (cust.status === 'none') {
            statusBadge = '<span class="badge badge-none">ไม่มีค่าใช้จ่าย (หักลบ)</span>';
        } else {
            statusBadge = '<span class="badge badge-pending">ค้างชำระ</span>';
        }

        let billsRowsHtml = '';
        cust.bills.forEach(bill => {
            const disc = (bill.before_discount || 0) - (bill.after_discount || 0);
            let rowStatusBadge = '';
            if (bill.status) {
                const s = bill.status;
                const isPaid = s === 'โอนแล้ว';
                rowStatusBadge = ` <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}" style="font-size: 0.6rem; padding: 0.1rem 0.3rem; margin-left: 0.2rem;">${s}</span>`;
            }

            billsRowsHtml += `
                <tr>
                    <td>
                        <span class="item-name">${bill.original_name}</span>
                        ${bill.note ? `<span class="text-note">${bill.note}</span>` : ''}
                    </td>
                    <td class="col-num">${formatNumber(bill.before_discount)}</td>
                    <td class="col-num text-teal">${formatNumber(disc)}</td>
                    <td class="col-num">${formatNumber(bill.after_discount)}${rowStatusBadge}</td>
                    <td class="row-actions-cell">
                        <button class="row-action-btn edit" onclick="openEditBillModal(${bill.originalIndex})" title="แก้ไขรายการบิล">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="row-action-btn delete" onclick="deleteBillItem(${bill.originalIndex}, '${cust.name}')" title="ลบรายการบิล">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        let headerNameHtml = '';
        if (editingCustomerName === cust.name) {
            headerNameHtml = `
                <div class="inline-rename-container">
                    <input type="text" id="renameInput-${cust.name.replace(/\s+/g, '_')}" class="inline-rename-input" value="${cust.name}" autofocus>
                    <button class="inline-rename-btn save" onclick="saveCustomerRename('${cust.name}')" title="บันทึก">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="inline-rename-btn cancel" onclick="cancelCustomerRename()" title="ยกเลิก">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        } else {
            headerNameHtml = `
                <div class="customer-name-container">
                    <div class="customer-name">${cust.name}</div>
                    <button class="edit-customer-btn" onclick="startCustomerRename('${cust.name}')" title="แก้ไขชื่อลูกค้า">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="customer-card-header">
                <div class="customer-name-wrapper">
                    <div class="customer-avatar"><i class="fa-solid fa-user"></i></div>
                    <div class="customer-title-area">
                        ${headerNameHtml}
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${cust.bills.length} รายการ</span>
                    </div>
                </div>
                ${statusBadge}
            </div>
            
            <div class="bill-table-wrapper">
                <table class="bill-table">
                    <thead>
                        <tr>
                            <th>รายการ</th>
                            <th>ยอดเต็ม</th>
                            <th>ลด 20%</th>
                            <th>ยอดจ่าย</th>
                            <th style="width: 60px; text-align: right;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${billsRowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="card-total-panel">
                <span class="card-total-label">ยอดจ่ายรวมทั้งหมด</span>
                <span class="card-total-val">${formatNumber(cust.totalAfter)} บาท</span>
            </div>

            <div class="card-actions">
                <button class="btn btn-secondary" onclick="copyCustomerText('${cust.name}')">
                    <i class="fa-solid fa-copy"></i> Copy ข้อความ
                </button>
                <button class="btn btn-primary" onclick="exportCustomerPNG('${cust.name}')">
                    <i class="fa-solid fa-image"></i> โหลดบิล PNG
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

// Inline Rename handlers
window.startCustomerRename = function(custName) {
    editingCustomerName = custName;
    renderCustomers();
    setTimeout(() => {
        const input = document.getElementById(`renameInput-${custName.replace(/\s+/g, '_')}`);
        if (input) {
            input.focus();
            input.select();
        }
    }, 50);
};

window.cancelCustomerRename = function() {
    editingCustomerName = null;
    renderCustomers();
};

window.saveCustomerRename = function(oldName) {
    const input = document.getElementById(`renameInput-${oldName.replace(/\s+/g, '_')}`);
    if (!input) return;

    const newName = input.value.trim();
    if (!newName) {
        showToast('กรุณาระบุชื่อลูกค้าที่ถูกต้อง', true);
        return;
    }

    if (newName === oldName) {
        cancelCustomerRename();
        return;
    }

    if (activeRoundData && activeRoundData.bills) {
        activeRoundData.bills.forEach(bill => {
            if (bill.base_name === oldName) {
                bill.base_name = newName;
                const escOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp('^' + escOld);
                bill.original_name = bill.original_name.replace(regex, newName);
            }
        });

        saveToLocalStorage();
        showToast(`เปลี่ยนชื่อ "${oldName}" เป็น "${newName}" สำเร็จ!`);
        populateNameSuggestions();
    }

    editingCustomerName = null;
    selectRound(currentRoundKey);
};

// Open Modals
window.openModal = function(modalId) {
    document.getElementById(modalId).classList.add('show');
};

window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('show');
};

// handle Add Round submit
function handleRoundSubmit(e) {
    e.preventDefault();
    const dateInput = document.getElementById('roundDateInput').value.trim();
    
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(dateInput)) {
        showToast('กรุณากรอกวันที่รูปแบบ วัน/เดือน/ปีพุทธศักราช (เช่น 16/06/2569)', true);
        return;
    }

    const match = dateInput.match(dateRegex);
    const dd = match[1];
    const mm = match[2];
    const yyyy = match[3];
    const yy = yyyy.substring(2, 4);

    const newKey = `${dd}${mm}${yy}`;

    if (billsData[newKey]) {
        showToast(`มีข้อมูลรอบวันที่ ${dateInput} อยู่ในระบบแล้ว`, true);
        return;
    }

    billsData[newKey] = {
        sheet_name: newKey,
        round_date: dateInput,
        bills: []
    };

    saveToLocalStorage();
    closeModal('roundModal');
    showToast(`สร้างรอบบิลวันที่ ${dateInput} สำเร็จ!`);
    
    currentRoundKey = newKey;
    initDashboard();
}

// Open Add Bill modal
function openAddBillModal() {
    document.getElementById('billForm').reset();
    document.getElementById('editBillIndex').value = '';
    document.getElementById('billModalTitle').innerText = 'เพิ่มรายการบิลย่อย';
    document.getElementById('autoCalcDiscount').checked = true;
    document.getElementById('billAfterInput').readOnly = true;
    
    openModal('billModal');
}

// Open Edit Bill modal
window.openEditBillModal = function(index) {
    if (!activeRoundData || !activeRoundData.bills || !activeRoundData.bills[index]) return;
    
    const bill = activeRoundData.bills[index];
    document.getElementById('editBillIndex').value = index;
    document.getElementById('billModalTitle').innerText = 'แก้ไขรายการบิลย่อย';
    
    document.getElementById('billNameInput').value = bill.original_name;
    document.getElementById('billBeforeInput').value = bill.before_discount;
    document.getElementById('billAfterInput').value = bill.after_discount;
    document.getElementById('billNoteInput').value = bill.note || '';
    document.getElementById('billStatusInput').value = bill.status || 'รอโอน';

    const is20Percent = Math.abs((bill.before_discount * 0.8) - bill.after_discount) < 0.05;
    const autoCalcCheckbox = document.getElementById('autoCalcDiscount');
    autoCalcCheckbox.checked = is20Percent;
    
    if (is20Percent) {
        document.getElementById('billAfterInput').readOnly = true;
    } else {
        document.getElementById('billAfterInput').readOnly = false;
    }

    openModal('billModal');
};

// handle Add/Edit Bill submit
function handleBillSubmit(e) {
    e.preventDefault();
    if (!currentRoundKey) {
        showToast('กรุณาสร้างรอบบิลก่อนเพิ่มรายการ', true);
        return;
    }

    const editIndex = document.getElementById('editBillIndex').value;
    const name = document.getElementById('billNameInput').value.trim();
    const beforeVal = parseFloat(document.getElementById('billBeforeInput').value) || 0;
    const afterVal = parseFloat(document.getElementById('billAfterInput').value) || 0;
    const note = document.getElementById('billNoteInput').value.trim();
    const status = document.getElementById('billStatusInput').value;

    const baseName = cleanBaseName(name);

    const billObj = {
        original_name: name,
        base_name: baseName,
        before_discount: beforeVal,
        after_discount: afterVal,
        note: note,
        status: status
    };

    if (editIndex === '') {
        activeRoundData.bills.push(billObj);
        showToast(`เพิ่มบิลของ "${name}" สำเร็จ!`);
    } else {
        const idx = parseInt(editIndex);
        activeRoundData.bills[idx] = billObj;
        showToast(`แก้ไขบิลของ "${name}" เรียบร้อย!`);
    }

    saveToLocalStorage();
    closeModal('billModal');
    populateNameSuggestions();
    selectRound(currentRoundKey);
}

// Delete specific bill item
window.deleteBillItem = function(index, name) {
    if (!activeRoundData || !activeRoundData.bills || !activeRoundData.bills[index]) return;
    
    const bill = activeRoundData.bills[index];
    if (confirm(`คุณต้องการลบรายการ "${bill.original_name}" ของ "${name}" ใช่หรือไม่?`)) {
        activeRoundData.bills.splice(index, 1);
        saveToLocalStorage();
        showToast(`ลบรายการบิลชำระเงินเรียบร้อยแล้ว!`);
        populateNameSuggestions();
        selectRound(currentRoundKey);
    }
};

// Delete active round
function deleteActiveRound() {
    if (!currentRoundKey) return;
    
    if (confirm(`⚠️ ยืนยันการลบรอบวันที่ "${activeRoundData.round_date}"?\nการกระทำนี้จะลบข้อมูลบิลทั้งหมดของรอบนี้และไม่สามารถกู้คืนได้!`)) {
        delete billsData[currentRoundKey];
        saveToLocalStorage();
        showToast(`ลบรอบวันที่ "${activeRoundData.round_date}" เรียบร้อยแล้ว!`);
        
        currentRoundKey = '';
        initDashboard();
    }
}

// Save settings (API Key)
function handleSettingsSubmit(e) {
    e.preventDefault();
    const key = document.getElementById('geminiApiKeyInput').value.trim();
    localStorage.setItem('GEMINI_API_KEY', key);
    closeModal('settingsModal');
    showToast('บันทึก API Key เรียบร้อยแล้ว!');
}

// Save Payment Info submit
function handlePaymentSubmit(e) {
    e.preventDefault();
    paymentInfo.bank = document.getElementById('paymentBankInput').value.trim();
    paymentInfo.acc_num = document.getElementById('paymentAccNumInput').value.trim();
    paymentInfo.acc_name = document.getElementById('paymentAccNameInput').value.trim();
    
    savePaymentInfo();
    updateSidebarPaymentInfo();
    closeModal('paymentModal');
    showToast('แก้ไขช่องทางการโอนเงินเรียบร้อยแล้ว!');
}

// Download state backup as data.js file
function downloadBackupData() {
    let outputString = "// Pre-parsed billing data from สรุปค่าใช้จ่ายวันพิเศษ (สำหรับแจ้งลูกค้า).xlsx\n";
    outputString += "window.INITIAL_BILLS_DATA = ";
    outputString += JSON.stringify(billsData, null, 2);
    outputString += ";\n";

    const blob = new Blob([outputString], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = 'data.js';
    link.href = url;
    link.click();
    
    showToast('ดาวน์โหลดไฟล์ข้อมูลสำรองสำเร็จ! กรุณานำไปบันทึกทับในโฟลเดอร์ของระบบ');
}

// Copy customer summary text to clipboard
window.copyCustomerText = function(custName) {
    const text = generateCustomerCopyText(custName);
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(`คัดลอกข้อความของ "${custName}" เรียบร้อยแล้ว!`);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showToast('เกิดข้อผิดพลาดในการคัดลอก', true);
    });
};

// Generate copyable text content
function generateCustomerCopyText(custName) {
    if (!activeRoundData) return '';
    const customers = groupBillsByCustomer(activeRoundData.bills);
    const cust = customers.find(c => c.name === custName);
    if (!cust) return '';

    let text = `📢 แจ้งยอดค่าใช้จ่ายรอบวันที่ ${activeRoundData.round_date}\n`;
    text += `👤 คุณ: ${cust.name}\n`;
    text += `----------------------------------------\n`;
    
    cust.bills.forEach(bill => {
        const disc = (bill.before_discount || 0) - (bill.after_discount || 0);
        text += `- ${bill.original_name}: ยอดเต็ม ${formatNumber(bill.before_discount)} บาท | ส่วนลด ${formatNumber(disc)} บาท | ยอดจ่าย ${formatNumber(bill.after_discount)} บาท`;
        if (bill.note) {
            text += ` (${bill.note})`;
        }
        text += `\n`;
    });
    
    text += `----------------------------------------\n`;
    
    if (cust.totalAfter <= 0) {
        text += `🎉 ยอดรวมจ่ายสุทธิ: 0 บาท (ไม่ต้องโอน/หักลดยอดถูกหวยแล้ว)\n`;
        text += `(หากมียอดคงค้างหรือยอดค้างรับรางวัล ระบบจะจัดการโอนคืนให้ครับ)\n`;
    } else {
        text += `💵 ยอดรวมที่ต้องชำระทั้งหมด: ${formatNumber(cust.totalAfter)} บาท\n`;
        text += `----------------------------------------\n`;
        text += `โปรดดำเนินการโอนค่าใช้จ่ายบัญชี\n`;
        text += `🏦 ช่องทาง: ${paymentInfo.bank}\n`;
        text += `💳 เลขบัญชี: ${paymentInfo.acc_num}\n`;
        text += `👤 ชื่อบัญชี: ${paymentInfo.acc_name}\n`;
        text += `(รบกวนแนบสลิปการโอนเงินด้วยครับ) 🙏`;
    }
    
    return text;
}

// Copy overall round summary tabular text
function copyRoundSummaryText() {
    if (!activeRoundData) return;
    const customers = groupBillsByCustomer(activeRoundData.bills);
    
    let text = `สรุปยอดบิลค่าใช้จ่าย รอบวันที่ ${activeRoundData.round_date}\n`;
    text += `ชื่อ\tยอดเต็ม\tส่วนลด\tยอดชำระ\tสถานะ\n`;
    
    customers.forEach(cust => {
        const disc = cust.totalBefore - cust.totalAfter;
        let statText = cust.status === 'paid' ? 'โอนแล้ว' : (cust.status === 'none' ? 'ไม่มีค้าง' : 'ค้างชำระ');
        text += `${cust.name}\t${cust.totalBefore}\t${disc}\t${cust.totalAfter}\t${statText}\n`;
    });
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('คัดลอกตารางสรุปรอบนี้เรียบร้อยแล้ว!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast('เกิดข้อผิดพลาดในการคัดลอก', true);
    });
}

// Export high resolution receipt as PNG
window.exportCustomerPNG = function(custName) {
    if (!activeRoundData) return;
    const customers = groupBillsByCustomer(activeRoundData.bills);
    const cust = customers.find(c => c.name === custName);
    if (!cust) return;

    showToast(`กำลังสร้างรูปภาพบิลของ "${custName}"...`);

    const captureTarget = document.getElementById('receiptCaptureTarget');
    
    let receiptRowsHtml = '';
    cust.bills.forEach(bill => {
        const disc = (bill.before_discount || 0) - (bill.after_discount || 0);
        receiptRowsHtml += `
            <tr>
                <td>
                    <strong>${bill.original_name}</strong>
                    ${bill.note ? `<br><small style="color: #6b7280; font-size: 0.7rem;">${bill.note}</small>` : ''}
                </td>
                <td style="text-align: right;">${formatNumber(bill.before_discount)}</td>
                <td style="text-align: right; color: #10b981;">-${formatNumber(disc)}</td>
                <td style="text-align: right; font-weight: 600;">${formatNumber(bill.after_discount)}</td>
            </tr>
        `;
    });

    const totalDisc = cust.totalBefore - cust.totalAfter;

    captureTarget.innerHTML = `
        <div class="receipt-header">
            <div class="receipt-logo">SPECIAL<span>DAY</span></div>
            <div class="receipt-title">ใบสรุปยอดบิลแจ้งหนี้ชำระเงิน</div>
        </div>
        
        <div class="receipt-meta-grid">
            <div>
                <span class="receipt-meta-label">ลูกค้ารายชื่อ:</span> ${cust.name}
            </div>
            <div style="text-align: right;">
                <span class="receipt-meta-label">รอบวันที่:</span> ${activeRoundData.round_date}
            </div>
        </div>
        
        <table class="receipt-table">
            <thead>
                <tr>
                    <th style="width: 45%;">รายการบิล</th>
                    <th style="text-align: right; width: 18%;">ยอดเต็ม</th>
                    <th style="text-align: right; width: 18%;">ลด 20%</th>
                    <th style="text-align: right; width: 19%;">ยอดจ่าย</th>
                </tr>
            </thead>
            <tbody>
                ${receiptRowsHtml}
            </tbody>
        </table>
        
        <div class="receipt-summary-box">
            <div class="receipt-summary-row">
                <span>ยอดเต็มรวมทั้งหมด:</span>
                <span>${formatNumber(cust.totalBefore)} บาท</span>
            </div>
            <div class="receipt-summary-row">
                <span>ส่วนลดรวม:</span>
                <span style="color: #10b981;">-${formatNumber(totalDisc)} บาท</span>
            </div>
            <div class="receipt-summary-row">
                <span class="receipt-grand-total-label">ยอดรวมที่ต้องชำระ:</span>
                <span class="receipt-grand-total">${formatNumber(cust.totalAfter)} บาท</span>
            </div>
        </div>
        
        <div class="receipt-payment-info">
            <span class="receipt-bank-highlight">📌 โปรดดำเนินการโอนค่าใช้จ่ายบัญชี</span>
            ${paymentInfo.bank} เลขที่บัญชี: <strong style="font-size: 0.85rem; color: #1e1b4b;">${paymentInfo.acc_num}</strong><br>
            ชื่อบัญชี: <strong>${paymentInfo.acc_name}</strong> (โปรดแนบสลิปการโอน)
        </div>
        
        <div class="receipt-footer">
            ขอขอบคุณสำหรับความไว้วางใจในการใช้บริการกับเรา<br>
            ออกใบสรุปค่าใช้จ่ายโดยอัตโนมัติ ณ วันที่ ${getCurrentDateString()}
        </div>
    `;

    setTimeout(() => {
        html2canvas(captureTarget, {
            scale: 2, 
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: true,
            useCORS: true
        }).then(canvas => {
            const dataUrl = canvas.toDataURL("image/png");
            
            const link = document.createElement('a');
            const cleanDate = activeRoundData.round_date.replace(/\//g, '-');
            link.download = `Bill_${cleanDate}_${custName}.png`;
            link.href = dataUrl;
            link.click();
            
            showToast(`ดาวน์โหลดบิลของ "${custName}" เรียบร้อยแล้ว!`);
        }).catch(err => {
            console.error('html2canvas error: ', err);
            showToast('เกิดข้อผิดพลาดในการสร้างไฟล์รูปภาพ', true);
        });
    }, 200);
};

// Show Toast Alert notification
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    
    toastMsg.innerText = message;
    
    if (isError) {
        toast.querySelector('i').className = 'fa-solid fa-circle-exclamation';
        toast.querySelector('i').style.color = '#ef4444';
        toast.style.borderColor = '#ef4444';
    } else {
        toast.querySelector('i').className = 'fa-solid fa-circle-check';
        toast.querySelector('i').style.color = '#10b981';
        toast.style.borderColor = '#8b5cf6';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Utility: Format Number
function formatNumber(num) {
    if (num === undefined || num === null) return '0.00';
    return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Utility: Get current date string for footer
function getCurrentDateString() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear() + 543; // BE Year
    return `${dd}/${mm}/${yyyy}`;
}
