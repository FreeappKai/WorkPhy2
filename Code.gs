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
  FOLDER_NAME: "Student_Videos_PE_Submission", // ชื่อโฟลเดอร์สำหรับเก็บวิดีโอ
  SHEET_SUBMISSIONS: "Submissions",            // ชื่อชีตเก็บข้อมูลการส่งงาน
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
        // สามารถเพิ่ม logic การดึงเกณฑ์จาก Sheet ได้ในอนาคต
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

// รองรับ GET request อย่างง่าย (สำหรับตรวจสอบว่า Script ทำงานอยู่)
function doGet(e) {
  return ContentService.createTextOutput("PE Submission System API is running...");
}

// --- ฟังก์ชันจัดการข้อมูล (Data Handlers) ---

/**
 * ดึงข้อมูลการส่งงานทั้งหมด
 */
function getSubmissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SUBMISSIONS);
  
  if (!sheet) return { success: true, data: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };

  // ดึงข้อมูลทั้งหมดตั้งแต่แถวที่ 2
  const values = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  
  const submissions = values.map((row, index) => {
    // row index + 2 เพราะเริ่มที่แถว 2
    const rowId = index + 2; 
    
    // แปลงข้อมูลจากแถวเป็น Object
    return {
      rowId: rowId,
      timestamp: row[0],
      name: row[1],
      studentNumber: row[2],
      grade: row[3],
      room: row[4],
      activityType: row[5],
      fileUrl: row[6],
      // ข้อมูลการตรวจ (Rubric Review)
      review: {
        contentAccuracy: Number(row[8]) || 0,
        participation: Number(row[9]) || 0,
        presentation: Number(row[10]) || 0,
        discipline: Number(row[11]) || 0,
        totalScore: Number(row[12]) || 0,
        percentage: Number(row[13]) || 0,
        comment: row[14] || "",
        status: row[15] || "Pending",
        gradedAt: row[16]
      }
    };
  }).filter(item => item.name !== ""); // กรองแถวว่างออก

  // เรียงลำดับล่าสุดขึ้นก่อน (Optional)
  submissions.reverse();

  return { success: true, data: submissions };
}

/**
 * อัปโหลดวิดีโอและบันทึกข้อมูล
 */
function handleUpload(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_SUBMISSIONS);
  
  if (!sheet) {
    setup(); // สร้างชีตถ้ายังไม่มี
    sheet = ss.getSheetByName(CONFIG.SHEET_SUBMISSIONS);
  }

  // 1. บันทึกไฟล์ลง Google Drive
  let fileUrl = "";
  let fileId = "";
  
  if (data.fileData) {
    try {
      const folder = getOrCreateFolder(CONFIG.FOLDER_NAME);
      const decodedData = Utilities.base64Decode(data.fileData);
      const blob = Utilities.newBlob(decodedData, data.mimeType, data.fileName);
      const file = folder.createFile(blob);
      
      // ตั้งค่าการแชร์ให้ทุกคนที่มีลิงก์ดูได้ (เพื่อให้แสดงในแอปได้)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      fileUrl = file.getUrl();
      fileId = file.getId();
    } catch (e) {
      return { success: false, message: "Upload failed: " + e.message };
    }
  }

  // 2. บันทึกข้อมูลลง Sheet
  const timestamp = new Date();
  
  // เรียงลำดับคอลัมน์ตามที่กำหนดไว้ใน getSubmissions
  const rowData = [
    timestamp,           // 1. Timestamp
    data.name,           // 2. Name
    "'" + data.studentNumber, // 3. Student Number (ใส่ ' เพื่อบังคับเป็น Text)
    data.grade,          // 4. Grade
    data.room,           // 5. Room
    data.activityType,   // 6. Activity Type
    fileUrl,             // 7. File URL
    fileId,              // 8. File ID
    0,                   // 9. Content Accuracy
    0,                   // 10. Participation
    0,                   // 11. Presentation
    0,                   // 12. Discipline
    0,                   // 13. Total Score
    0,                   // 14. Percentage
    "",                  // 15. Comment
    "Pending",           // 16. Status
    ""                   // 17. Graded At
  ];

  sheet.appendRow(rowData);

  return { success: true, message: "Upload successful" };
}

/**
 * บันทึกผลการตรวจงาน (Grade)
 */
function handleGrade(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SUBMISSIONS);
  
  if (!sheet) return { success: false, message: "Sheet not found" };
  
  const rowId = data.rowId;
  if (!rowId) return { success: false, message: "Invalid Row ID" };

  // ตรวจสอบว่า Row ID อยู่ในขอบเขตข้อมูลจริงหรือไม่
  const lastRow = sheet.getLastRow();
  if (rowId > lastRow) return { success: false, message: "Row not found" };

  // อัปเดตข้อมูลในคอลัมน์ 9-17 (Rubric Data)
  // setValues รับ array 2 มิติ: [[val1, val2, ...]]
  const gradeData = [[
    data.contentAccuracy,
    data.participation,
    data.presentation,
    data.discipline,
    data.totalScore,
    data.percentage,
    data.comment,
    data.status,
    new Date() // Graded At
  ]];

  // getRange(row, column, numRows, numColumns)
  // เริ่มที่คอลัมน์ 9 (Content Accuracy)
  sheet.getRange(rowId, 9, 1, 9).setValues(gradeData);

  return { success: true, message: "Grading saved" };
}

/**
 * ตรวจสอบการเข้าสู่ระบบครู
 */
function handleLogin(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  
  // ถ้าไม่มีชีตครู ให้สร้างและเพิ่ม user default
  if (!sheet) {
    setup();
    sheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  }

  const values = sheet.getDataRange().getValues();
  // ข้าม header แถวแรก
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // row[0] = username, row[1] = pin, row[2] = name
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Submissions Sheet
  let subSheet = ss.getSheetByName(CONFIG.SHEET_SUBMISSIONS);
  if (!subSheet) {
    subSheet = ss.insertSheet(CONFIG.SHEET_SUBMISSIONS);
    // สร้าง Header
    const headers = [
      "Timestamp", "Name", "Student Number", "Grade", "Room", "Activity Type", 
      "File URL", "File ID", 
      "Content Accuracy", "Participation", "Presentation", "Discipline", 
      "Total Score", "Percentage", "Comment", "Status", "Graded At"
    ];
    subSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    subSheet.setFrozenRows(1);
  }

  // 2. Setup Teachers Sheet
  let teacherSheet = ss.getSheetByName(CONFIG.SHEET_TEACHERS);
  if (!teacherSheet) {
    teacherSheet = ss.insertSheet(CONFIG.SHEET_TEACHERS);
    const headers = ["Username", "PIN", "Name"];
    teacherSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // เพิ่ม Default Teacher
    teacherSheet.appendRow(["teacher", "1234", "คุณครูใจดี"]);
    teacherSheet.setFrozenRows(1);
  }
  
  Logger.log("Setup completed successfully.");
}
