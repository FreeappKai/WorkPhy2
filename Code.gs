/**
 * 🏃 ระบบส่งงานวิชาสุขศึกษาและพลศึกษา (Backend)
 * Google Apps Script
 * 
 * คำแนะนำการติดตั้ง:
 * 1. นำโค้ดนี้ไปวางใน Google Apps Script Project
 * 2. กด Run ฟังก์ชัน 'setup' หนึ่งครั้งเพื่อสร้าง Sheet และ Folder
 * 3. Deploy as Web App -> Execute as: Me -> Who has access: Anyone
 */

// --- การตั้งค่า (Configuration) ---
const CONFIG = {
  // ID ของ Google Spreadsheet ที่เก็บข้อมูล (ตามที่ระบุมา)
  SPREADSHEET_ID: "1Q8H3WkidkIfW_e5Voinf1Xro07fU3GPmGCJla4aq9tw",
  FOLDER_NAME: "Student_Videos_PE_Submission", // ชื่อโฟลเดอร์สำหรับเก็บวิดีโอ
  SHEET_CHILDREN: "Submissions_Children",      // ชื่อชีตเก็บข้อมูลงานวันเด็ก
  SHEET_SPORTS: "Submissions_Sports",          // ชื่อชีตเก็บข้อมูลงานกีฬาสี
  SHEET_TEACHERS: "Teachers"                   // ชื่อชีตเก็บข้อมูลครู
};

// --- ฟังก์ชันหลัก (Main Entry Point) ---

function doPost(e) {
  // ใช้ LockService เพื่อป้องกันการเขียนข้อมูลชนกัน
  const lock = LockService.getScriptLock();
  
  try {
    // รอคิวสูงสุด 30 วินาที
    lock.tryLock(30000); 

    if (!e || !e.postData) {
      return createJSONOutput({ success: false, message: "No data received" });
    }

    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    const data = params.data;
    
    let result = {};

    switch (action) {
      case 'list':
        result = getSubmissions();
        break;
      case 'upload':
        result = handleUpload(data);
        break;
      case 'grade':
        result = handleGrade(data);
        break;
      case 'login':
        result = handleLogin(data);
        break;
      case 'get_rubric':
        result = { success: true, data: [] }; 
        break;
      default:
        result = { success: false, message: "Unknown action: " + action };
    }

    return createJSONOutput(result);

  } catch (error) {
    return createJSONOutput({
      success: false,
      message: "Server Error: " + error.toString(),
      stack: error.stack
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput("PE Submission System API is running...");
}

// --- ฟังก์ชันจัดการข้อมูล (Data Handlers) ---

/**
 * Helper เพื่อดึง Spreadsheet ที่ถูกต้อง
 */
function getSpreadsheet() {
  try {
    if (CONFIG.SPREADSHEET_ID) {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    // Fallback กรณี ID ผิดหรือไม่มีสิทธิ์
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * ดึงข้อมูลการส่งงานทั้งหมดจากทั้งสองชีต
 */
function getSubmissions() {
  const ss = getSpreadsheet();
  let allSubmissions = [];

  // Helper function to read from a sheet
  const readSheet = (sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const lastCol = sheet.getLastColumn();
    // Use getDataRange or safe range to avoid errors if columns are missing
    // We expect up to col 17 (Q), but sheet might have fewer
    const numCols = Math.max(lastCol, 17);
    
    // If lastCol is 0 (empty sheet), return empty
    if (lastCol === 0) return [];

    // Get values. If we ask for more columns than exist, getRange might fail in some contexts,
    // but usually it's safer to get existing range and pad in JS.
    // However, to be safe, let's get what exists.
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    return values.map((row, index) => {
      const rowId = index + 2; 
      
      // Helper to safely get column value (0-based index)
      const getCol = (idx) => (idx < row.length ? row[idx] : "");

      return {
        rowId: rowId,
        sheetName: sheetName, // ระบุชื่อชีตเพื่อใช้อ้างอิงตอนบันทึกคะแนน
        timestamp: getCol(1), // Col B
        name: getCol(2),      // Col C
        studentNumber: getCol(3), // Col D
        grade: getCol(4),     // Col E
        room: getCol(5),      // Col F
        activityType: getCol(6), // Col G
        fileUrl: getCol(7),   // Col H
        review: {
          contentAccuracy: Number(getCol(8)) || 0, // Col I
          participation: Number(getCol(9)) || 0,   // Col J
          presentation: Number(getCol(10)) || 0,   // Col K
          discipline: Number(getCol(11)) || 0,     // Col L
          totalScore: Number(getCol(12)) || 0,     // Col M
          percentage: Number(getCol(13)) || 0,     // Col N
          comment: getCol(14) || "",               // Col O
          status: getCol(15) || "Pending",         // Col P
          gradedAt: getCol(16)                     // Col Q
        }
      };
    }).filter(item => item.name !== ""); 
  };

  // อ่านจากทั้งสองชีต
  const childrenSubs = readSheet(CONFIG.SHEET_CHILDREN);
  const sportsSubs = readSheet(CONFIG.SHEET_SPORTS);

  allSubmissions = [...childrenSubs, ...sportsSubs];

  // เรียงลำดับล่าสุดขึ้นก่อน
  allSubmissions.sort((a, b) => {
    const dateA = new Date(a.timestamp || 0);
    const dateB = new Date(b.timestamp || 0);
    return dateB - dateA;
  });

  return { success: true, data: allSubmissions };
}

/**
 * อัปโหลดวิดีโอและบันทึกข้อมูล
 */
function handleUpload(data) {
  const ss = getSpreadsheet();
  
  // เลือกชีตตามประเภทกิจกรรม
  let targetSheetName = CONFIG.SHEET_CHILDREN;
  if (data.activityType === 'Sports Day') {
    targetSheetName = CONFIG.SHEET_SPORTS;
  }

  let sheet = ss.getSheetByName(targetSheetName);
  
  if (!sheet) {
    setup(); 
    sheet = ss.getSheetByName(targetSheetName);
  }

  // Ensure sheet has enough columns (up to Q = 17)
  ensureColumns(sheet, 17);

  let fileUrl = "";
  
  if (data.fileData) {
    try {
      const folder = getOrCreateFolder(CONFIG.FOLDER_NAME);
      const decodedData = Utilities.base64Decode(data.fileData);
      const blob = Utilities.newBlob(decodedData, data.mimeType, data.fileName);
      const file = folder.createFile(blob);
      
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      fileUrl = file.getUrl();
    } catch (e) {
      return { success: false, message: "Upload failed: " + e.message };
    }
  }

  const timestamp = new Date();
  const lastRow = sheet.getLastRow();
  const newId = lastRow; // Simple ID generation based on row count (starts at 1 for header)

  const rowData = [
    newId,               // A: ID
    timestamp,           // B: Timestamp
    data.name,           // C: Name
    "'" + data.studentNumber, // D: Student Number
    data.grade,          // E: Grade
    data.room,           // F: Room
    data.activityType,   // G: Activity Type
    fileUrl,             // H: File URL
    0,                   // I: Content Accuracy
    0,                   // J: Participation
    0,                   // K: Presentation
    0,                   // L: Discipline
    0,                   // M: Total Score
    0,                   // N: Percentage
    "",                  // O: Comment
    "Pending",           // P: Status
    ""                   // Q: Graded At
  ];

  sheet.appendRow(rowData);

  return { success: true, message: "Upload successful" };
}

/**
 * บันทึกผลการตรวจงาน (Grade)
 */
function handleGrade(data) {
  const ss = getSpreadsheet();
  
  // ต้องระบุ sheetName มาด้วย
  const sheetName = data.sheetName || CONFIG.SHEET_CHILDREN; // Default fallback
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) return { success: false, message: "Sheet not found: " + sheetName };
  
  const rowId = data.rowId;
  if (!rowId) return { success: false, message: "Invalid Row ID" };

  const lastRow = sheet.getLastRow();
  if (rowId > lastRow) return { success: false, message: "Row not found" };

  // Ensure sheet has enough columns (up to Q = 17)
  ensureColumns(sheet, 17);

  const gradeData = [[
    data.contentAccuracy,
    data.participation,
    data.presentation,
    data.discipline,
    data.totalScore,
    data.percentage,
    data.comment,
    data.status,
    new Date() 
  ]];

  // เริ่มที่คอลัมน์ 9 (I)
  sheet.getRange(rowId, 9, 1, 9).setValues(gradeData);

  return { success: true, message: "Grading saved" };
}

/**
 * Helper to ensure sheet has at least N columns
 */
function ensureColumns(sheet, minCols) {
  const currentCols = sheet.getMaxColumns();
  if (currentCols < minCols) {
    sheet.insertColumnsAfter(currentCols, minCols - currentCols);
  }
}

/**
 * ตรวจสอบการเข้าสู่ระบบครู
 */
function handleLogin(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  
  if (!sheet) {
    setup();
    sheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  }

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[0]) === String(data.username) && String(row[1]) === String(data.pin)) {
      return { 
        success: true, 
        message: "Login successful", 
        teacherName: row[2] 
      };
    }
  }

  return { success: false, message: "Invalid username or PIN" };
}

// --- ฟังก์ชันช่วยเหลือ (Helpers) ---

function createJSONOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

// --- ฟังก์ชันติดตั้งครั้งแรก (Setup) ---

function setup() {
  const ss = getSpreadsheet();
  
  const headers = [
    "ID", "Timestamp", "Name", "Student Number", "Grade", "Room", "Activity Type", 
    "URL", 
    "Content Accuracy", "Participation", "Presentation", "Discipline", 
    "Total Score", "Percentage", "Comment", "Status", "Graded At"
  ];

  // Setup Children Sheet
  let childrenSheet = ss.getSheetByName(CONFIG.SHEET_CHILDREN);
  if (!childrenSheet) {
    childrenSheet = ss.insertSheet(CONFIG.SHEET_CHILDREN);
    childrenSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    childrenSheet.setFrozenRows(1);
  }

  // Setup Sports Sheet
  let sportsSheet = ss.getSheetByName(CONFIG.SHEET_SPORTS);
  if (!sportsSheet) {
    sportsSheet = ss.insertSheet(CONFIG.SHEET_SPORTS);
    sportsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sportsSheet.setFrozenRows(1);
  }

  // Setup Teachers Sheet
  let teacherSheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  if (!teacherSheet) {
    teacherSheet = ss.insertSheet(CONFIG.SHEET_TEACHERS);
    const tHeaders = ["Username", "PIN", "Name"];
    teacherSheet.getRange(1, 1, 1, tHeaders.length).setValues([tHeaders]);
    
    teacherSheet.appendRow(["teacher", "1234", "คุณครูใจดี"]);
    teacherSheet.setFrozenRows(1);
  }
  
  Logger.log("Setup completed for Spreadsheet ID: " + CONFIG.SPREADSHEET_ID);
}
