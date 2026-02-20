
import { GoogleGenAI, Type } from "@google/genai";
import confetti from "canvas-confetti";
import React, { useMemo, useState } from 'react';
import { RubricReview, StudentSubmission } from '../types';

interface TeacherViewProps {
  submissions: StudentSubmission[];
  onUpdate: () => void;
  handleUpdateGrade: (rowId: number, rubricData: any) => Promise<boolean>;
  rubricCriteria: any[];
  teacherName: string;
  onGenerateAIFeedback: (studentName: string, rubric: RubricReview) => Promise<string>;
}

const TeacherView: React.FC<TeacherViewProps> = ({ submissions, onUpdate, handleUpdateGrade, rubricCriteria, teacherName, onGenerateAIFeedback }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterGrade, setFilterGrade] = useState('All');
  const [filterRoom, setFilterRoom] = useState('All');
  const [filterActivity, setFilterActivity] = useState('Sports Day');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Graded'>('All');
  
  const [isBulkGrading, setIsBulkGrading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // States for Advanced PDF Export
  const [exportGrade, setExportGrade] = useState<string>('Prathom 5');
  const [exportRoom, setExportRoom] = useState<string>('All');
  const [exportActivity, setExportActivity] = useState<string>('Sports Day');

  const [rubric, setRubric] = useState<RubricReview>({
    contentAccuracy: 0, participation: 0, presentation: 0, discipline: 0,
    totalScore: 0, percentage: 0, comment: '', status: 'Pending'
  });

  const [saving, setSaving] = useState(false);
  const [isAutoGrading, setIsAutoGrading] = useState(false);

  // กรองข้อมูลและจัดการการเรียงลำดับที่เป็นตัวเลข (Numeric Sorting)
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      const matchesText = s.name.toLowerCase().includes(filterText.toLowerCase()) || 
                         s.studentNumber.includes(filterText);
      const matchesGrade = filterGrade === 'All' || s.grade === filterGrade;
      const matchesRoom = filterRoom === 'All' || s.room === filterRoom;
      const matchesActivity = filterActivity === 'All' || s.activityType === filterActivity;
      
      const isGraded = s.review?.status === 'Graded';
      const matchesStatus = filterStatus === 'All' || 
                           (filterStatus === 'Graded' && isGraded) || 
                           (filterStatus === 'Pending' && !isGraded);

      return matchesText && matchesGrade && matchesRoom && matchesActivity && matchesStatus;
    }).sort((a, b) => {
        // เรียงตามห้องก่อน แล้วตามเลขที่
        if (a.room !== b.room) return a.room.localeCompare(b.room);
        return parseInt(a.studentNumber || '0') - parseInt(b.studentNumber || '0');
    });
  }, [submissions, filterText, filterGrade, filterRoom, filterActivity, filterStatus]);

  const pendingVisibleSubmissions = useMemo(() => 
    filteredSubmissions.filter(s => !s.review || s.review.status !== 'Graded'),
    [filteredSubmissions]
  );

  const startGrading = (sub: StudentSubmission) => {
    const uniqueId = `${sub.sheetName}-${sub.rowId}`;
    setEditingId(uniqueId);
    setErrorMessage(null);
    setRubric(sub.review || {
      contentAccuracy: 0, participation: 0, presentation: 0, discipline: 0,
      totalScore: 0, percentage: 0, comment: '', status: 'Pending'
    });
    setTimeout(() => {
        document.getElementById(`editor-${uniqueId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const updateRubricItem = (key: keyof RubricReview, val: any) => {
    setRubric(prev => {
      const next = { ...prev, [key]: val };
      if (typeof val === 'number' && ['contentAccuracy', 'participation', 'presentation', 'discipline'].includes(key)) {
        const total = (next.contentAccuracy || 0) + (next.participation || 0) + (next.presentation || 0) + (next.discipline || 0);
        next.totalScore = total;
        next.percentage = Math.round((total / 20) * 100);
      }
      return next;
    });
  };

  // --- อัปเกรด AI ประเมินผลระดับเชี่ยวชาญ (Serious Pedagogical Assessment) ---
  const runAIScore = async (student: StudentSubmission) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest',
      contents: `คุณคือคุณครูผู้เชี่ยวชาญด้านสุขศึกษาและพลศึกษา ระดับประถมศึกษา
หน้าที่: ประเมินวิดีโอส่งงานของนักเรียน "${student.name}" ระดับชั้น ${student.grade} 
กิจกรรม: ${student.activityType === 'Sports Day' ? 'ทักษะการเคลื่อนไหว (กีฬาสี)' : 'การแสดงออกเชิงสร้างสรรค์ (วันเด็ก)'}

เกณฑ์การให้คะแนน (0-5 คะแนนต่อหัวข้อ):
1. contentAccuracy: ความถูกต้องของท่าทางและเนื้อหาตามบทเรียน
2. participation: ความตั้งใจ มุ่งมั่น และความต่อเนื่องในการปฏิบัติ
3. presentation: การสื่อสารที่ชัดเจน การจัดวางภาพ และความน่าสนใจ
4. discipline: ระเบียบวินัย การแต่งกาย และมารยาท

ภารกิจ: ให้คะแนนตามรูบริก และเขียน "comment" ภาษาไทย 2 ประโยคที่สร้างแรงบันดาลใจ โดยระบุ "จุดที่ทำได้ดีเยี่ยม" และ "จุดที่ควรพัฒนาต่อ"
รูปแบบการส่งคืน: JSON เท่านั้น`,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contentAccuracy: { type: Type.INTEGER, description: "0-5" },
            participation: { type: Type.INTEGER, description: "0-5" },
            presentation: { type: Type.INTEGER, description: "0-5" },
            discipline: { type: Type.INTEGER, description: "0-5" },
            comment: { type: Type.STRING, description: "คำชมและคำแนะนำภาษาไทย" }
          },
          required: ["contentAccuracy", "participation", "presentation", "discipline", "comment"]
        }
      }
    });
    return JSON.parse(response.text);
  };

  const handleAutoGrade = async () => {
    const currentStudent = filteredSubmissions.find(s => `${s.sheetName}-${s.rowId}` === editingId);
    if (!currentStudent) return;
    setIsAutoGrading(true);
    try {
      const aiResult = await runAIScore(currentStudent);
      const total = aiResult.contentAccuracy + aiResult.participation + aiResult.presentation + aiResult.discipline;
      setRubric(prev => ({ 
        ...prev, 
        ...aiResult, 
        totalScore: total, 
        percentage: Math.round((total / 20) * 100),
        comment: `🤖 [AI ประเมิน]: ${aiResult.comment}`
      }));
    } catch (error) { 
      setErrorMessage("AI พบข้อผิดพลาดในการวิเคราะห์วิดีโอ กรุณาประเมินด้วยตนเองนะจ๊ะ"); 
    } finally { 
      setIsAutoGrading(false); 
    }
  };

  const handleBulkAutoGrade = async () => {
    if (pendingVisibleSubmissions.length === 0) return;
    setIsBulkGrading(true);
    setBulkProgress({ current: 0, total: pendingVisibleSubmissions.length, currentName: '' });

    for (let i = 0; i < pendingVisibleSubmissions.length; i++) {
      const sub = pendingVisibleSubmissions[i];
      setBulkProgress(prev => ({ ...prev, current: i + 1, currentName: sub.name }));
      try {
        const aiResult = await runAIScore(sub);
        const total = aiResult.contentAccuracy + aiResult.participation + aiResult.presentation + aiResult.discipline;
        if (sub.rowId !== undefined) {
          await handleUpdateGrade(sub.rowId, {
            ...aiResult,
            totalScore: total,
            percentage: Math.round((total / 20) * 100),
            status: 'Graded',
            comment: `🤖 [AI อัตโนมัติ]: ${aiResult.comment}`,
            activityType: sub.activityType
          });
        }
      } catch (err) { console.error(err); }
    }
    setIsBulkGrading(false);
    onUpdate();
    confetti({ particleCount: 150, spread: 60, origin: { y: 0.7 } });
  };

  const handleSave = async () => {
    const currentStudent = filteredSubmissions.find(s => `${s.sheetName}-${s.rowId}` === editingId);
    if (!editingId || !currentStudent || !currentStudent.rowId) return;
    setSaving(true);
    const success = await handleUpdateGrade(currentStudent.rowId, { ...rubric, status: 'Graded', activityType: currentStudent.activityType });
    if (success) { setEditingId(null); onUpdate(); }
    setSaving(false);
  };

  // --- ระบบออกรายงาน PDF ฉบับทางการ (Official Reporting Engine) ---
  
  const exportDetailedPDF = () => {
    const toExport = submissions.filter(s => 
      s.grade === exportGrade && 
      (exportRoom === 'All' || s.room === exportRoom) && 
      s.activityType === exportActivity
    ).sort((a, b) => {
        if (a.room !== b.room) return a.room.localeCompare(b.room);
        return parseInt(a.studentNumber || '0') - parseInt(b.studentNumber || '0');
    });

    if (toExport.length === 0) return alert("ไม่พบข้อมูลนักเรียนในเงื่อนไขที่เลือกจ้า");
    
    const roomText = exportRoom === 'All' ? 'ทุกห้องเรียน' : exportRoom.replace('Room ', 'ห้อง ');
    const filename = `รายงานละเอียด_${exportGrade}_${roomText}_${exportActivity}`;
    
    renderOfficialPDF(toExport, `ระดับชั้น ${exportGrade === 'Prathom 5' ? 'ป.5' : 'ป.6'} | ${roomText}`, 'detailed', filename);
  };

  const exportSummaryScorePDF = () => {
    const toExport = submissions.filter(s => 
      s.grade === exportGrade && 
      (exportRoom === 'All' || s.room === exportRoom) &&
      s.activityType === exportActivity
    ).sort((a, b) => {
      if (a.room !== b.room) return a.room.localeCompare(b.room);
      return parseInt(a.studentNumber || '0') - parseInt(b.studentNumber || '0');
    });

    if (toExport.length === 0) return alert("ไม่พบข้อมูลนักเรียนในเงื่อนไขที่เลือกจ้า");

    const roomText = exportRoom === 'All' ? 'ทุกห้องเรียน' : exportRoom.replace('Room ', 'ห้อง ');
    const filename = `สรุปคะแนน_${exportGrade}_${roomText}_${exportActivity}`;

    renderOfficialPDF(toExport, `ใบสรุปคะแนนรวมกิจกรรม ระดับชั้น ${exportGrade === 'Prathom 5' ? 'ป.5' : 'ป.6'} (${roomText})`, 'summary', filename);
  };

  const renderOfficialPDF = (dataList: StudentSubmission[], subtitle: string, mode: 'detailed' | 'summary', filename: string) => {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;
    const activityName = exportActivity === 'Sports Day' ? 'กิจกรรมกีฬาสี 🏃' : 'กิจกรรมวันเด็ก 🎈';

    // Set document title for PDF filename
    const originalTitle = document.title;
    document.title = filename;

    printArea.innerHTML = `
      <div class="print-header" style="font-family: 'Sarabun', sans-serif; text-align: center;">
        <h1 style="font-size: 24pt; margin: 0; font-weight: bold; border-bottom: 3px solid #000; display: inline-block; padding-bottom: 10px;">ใบรายงานคะแนนวิชาสุขศึกษาและพลศึกษา</h1>
        <h2 style="font-size: 18pt; margin: 15px 0 10px;">${activityName}</h2>
        <p style="font-size: 14pt; font-weight: bold; color: #333;">${subtitle}</p>
      </div>
      <table style="width: 100%; border: 2px solid #000; border-collapse: collapse; font-family: 'Sarabun', sans-serif; margin-top: 25px; font-size: 14pt;">
        <thead>
          <tr style="background-color: #e2e8f0;">
            ${mode === 'summary' ? '<th style="border: 1px solid #000; padding: 12px; width: 10%;">ห้อง</th>' : ''}
            <th style="border: 1px solid #000; padding: 12px; width: 10%;">เลขที่</th>
            <th style="border: 1px solid #000; padding: 12px; text-align: left;">ชื่อ-นามสกุล</th>
            <th style="border: 1px solid #000; padding: 12px; width: 15%; background-color: #cbd5e1;">คะแนนรวม (20)</th>
            ${mode === 'detailed' ? '<th style="border: 1px solid #000; padding: 12px; text-align: left; width: 40%;">หมายเหตุ / คำแนะนำจากครู</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${dataList.map((s, index) => `
            <tr style="background-color: ${index % 2 === 0 ? '#fff' : '#f8fafc'};">
              ${mode === 'summary' ? `<td style="border: 1px solid #000; padding: 10px; text-align: center;">${s.room.replace('Room ', '')}</td>` : ''}
              <td style="border: 1px solid #000; padding: 10px; text-align: center;">${s.studentNumber}</td>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; font-weight: 500;">${s.name}</td>
              <td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold; font-size: 16pt; background-color: ${s.review?.totalScore ? '#f1f5f9' : 'transparent'};">${s.review?.totalScore ?? '-'}</td>
              ${mode === 'detailed' ? `<td style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12pt; line-height: 1.4;">${s.review?.comment || '<span style="color:#aaa; font-style:italic;">รอการประเมิน</span>'}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top: 60px; text-align: right; padding-right: 60px; font-family: 'Sarabun', sans-serif;">
        <div style="display: inline-block; text-align: center;">
          <p style="font-size: 14pt;">ลงชื่อ.......................................................... คุณครูผู้สอน</p>
          <p style="margin: 15px 0; font-weight: bold; font-size: 16pt;">(${teacherName})</p>
          <p style="font-size: 12pt; color: #666;">วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    `;
    
    window.print();
    
    // Restore title
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const PointSelector = ({ label, icon, current, onSelect }: { label: string, icon: string, current: number, onSelect: (v: number) => void }) => (
    <div className="bg-white p-4 rounded-2xl border-2 border-indigo-50 mb-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-indigo-700 flex items-center gap-2"><span className="text-xl">{icon}</span> {label}</span>
        <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold">{current}/5</span>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4, 5].map(pt => (
          <button key={pt} onClick={() => onSelect(pt)} className={`flex-1 py-3 rounded-xl font-bold transition-all ${current === pt ? 'bg-indigo-500 text-white shadow-lg' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>{pt}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {isBulkGrading && (
        <div className="fixed inset-0 z-[200] bg-indigo-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] p-10 max-w-lg w-full text-center shadow-2xl border-8 border-indigo-50 animate-in zoom-in">
            <div className="text-7xl mb-6 animate-bounce">🤖</div>
            <h3 className="text-3xl font-kids text-indigo-600 mb-2">AI กำลังวิเคราะห์วิดีโอ...</h3>
            <p className="text-slate-500 font-bold mb-8">ตรวจงานของ: <span className="text-indigo-500">{bulkProgress.currentName}</span></p>
            <div className="w-full bg-slate-100 h-6 rounded-full overflow-hidden mb-4 border-2 border-indigo-50">
              <div className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-full transition-all duration-500" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div>
            </div>
            <p className="text-sm font-black text-indigo-400">{bulkProgress.current} จาก {bulkProgress.total} คน</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[3rem] p-6 shadow-xl border-4 border-indigo-50">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-6">
              <div className="text-6xl bg-indigo-100 p-4 rounded-3xl shadow-inner">👩‍🏫</div>
              <div>
                  <h2 className="text-2xl font-kids text-indigo-600">สวัสดีครับคุณครู {teacherName}</h2>
                  <p className="text-slate-400 font-bold italic text-sm">ส่วนงานประเมินผลและออกรายงานวิชาสุขศึกษา</p>
              </div>
            </div>
            <button onClick={handleBulkAutoGrade} className="bg-yellow-400 text-indigo-900 px-8 py-4 rounded-2xl font-bold shadow-lg hover:bg-yellow-300 transition-all flex items-center gap-2 group">
                <span className="text-2xl group-hover:rotate-12 transition-transform">🪄</span>
                AI ตรวจงานรอตรวจทั้งหมด ({pendingVisibleSubmissions.length})
            </button>
        </div>

        {/* 📋 Official PDF Export Control Center */}
        <div className="bg-indigo-50 p-6 rounded-[2.5rem] border-4 border-indigo-100 shadow-sm space-y-4">
          <h3 className="text-lg font-kids text-indigo-700 flex items-center gap-2">
            <span className="text-2xl">📄</span> ออกรายงานทางการ (Official Report PDF)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-indigo-600 mb-2 ml-2 uppercase">1. ระดับชั้น</label>
              <select value={exportGrade} onChange={(e) => setExportGrade(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold text-indigo-800 outline-none">
                <option value="Prathom 5">ประถมศึกษาปีที่ 5 (ป.5)</option>
                <option value="Prathom 6">ประถมศึกษาปีที่ 6 (ป.6)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-600 mb-2 ml-2 uppercase">2. ห้องเรียน</label>
              <select value={exportRoom} onChange={(e) => setExportRoom(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold text-indigo-800 outline-none">
                <option value="All">ทุกห้อง (All Rooms)</option>
                {[1,2,3,4].map(r => <option key={r} value={`Room ${r}`}>ห้อง {r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-600 mb-2 ml-2 uppercase">3. ชุดกิจกรรม</label>
              <select value={exportActivity} onChange={(e) => setExportActivity(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold text-indigo-800 outline-none">
                <option value="Sports Day">งานกีฬาสี 🏃</option>
                <option value="Children Day">งานวันเด็ก 🎈</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <button onClick={exportDetailedPDF} className="w-full bg-indigo-600 text-white py-2.5 rounded-2xl font-bold text-xs hover:bg-indigo-700 shadow-md transition-all flex items-center justify-center gap-2">
                พิมพ์/บันทึก PDF (ละเอียด) 📄
              </button>
              <button onClick={exportSummaryScorePDF} className="w-full bg-slate-700 text-white py-2.5 rounded-2xl font-bold text-xs hover:bg-slate-800 shadow-md transition-all flex items-center justify-center gap-2">
                พิมพ์/บันทึก PDF (สรุป) 📊
              </button>
            </div>
          </div>
          <p className="text-[10px] text-indigo-400 font-bold italic ml-2">* เลือกปลายทางเป็น "Save as PDF" เพื่อให้รูปแบบตารางถูกต้องและคมชัดที่สุด</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border-2 border-indigo-50">
          <div className="flex flex-wrap justify-center gap-3 mb-6">
              {[
                  {id: 'All', label: 'ทั้งหมด', icon: '📁'},
                  {id: 'Pending', label: 'รอตรวจ', icon: '⏳'},
                  {id: 'Graded', label: 'ตรวจแล้ว', icon: '✅'}
              ].map(tab => (
                  <button key={tab.id} onClick={() => setFilterStatus(tab.id as any)} className={`px-6 py-2.5 rounded-2xl font-bold transition-all flex items-center gap-2 ${filterStatus === tab.id ? 'bg-indigo-500 text-white shadow-md' : 'text-indigo-400 hover:bg-white'}`}>
                      <span>{tab.icon}</span> {tab.label}
                  </button>
              ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                  <label className="block text-[10px] font-black text-indigo-300 mb-2 ml-2 uppercase tracking-tighter">กรองชุดกิจกรรม</label>
                  <select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value as any)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold outline-none cursor-pointer">
                      <option value="Sports Day">งานกีฬาสี 🏃</option>
                      <option value="Children Day">งานวันเด็ก 🎈</option>
                      <option value="All">ทุกกิจกรรม</option>
                  </select>
              </div>
              <div>
                  <label className="block text-[10px] font-black text-indigo-300 mb-2 ml-2 uppercase tracking-tighter">ค้นหา ชื่อ/เลขที่</label>
                  <input type="text" placeholder="พิมพ์เพื่อค้นหา..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 outline-none font-bold focus:border-indigo-300 transition-colors shadow-inner"/>
              </div>
              <div>
                  <label className="block text-[10px] font-black text-indigo-300 mb-2 ml-2 uppercase tracking-tighter">ระดับชั้น</label>
                  <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold cursor-pointer">
                      <option value="All">ทุกชั้น</option>
                      <option value="Prathom 5">ป.5</option>
                      <option value="Prathom 6">ป.6</option>
                  </select>
              </div>
              <div>
                  <label className="block text-[10px] font-black text-indigo-300 mb-2 ml-2 uppercase tracking-tighter">ห้องเรียน</label>
                  <select value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)} className="w-full p-3 rounded-2xl bg-white border-2 border-indigo-100 font-bold cursor-pointer">
                      <option value="All">ทุกห้อง</option>
                      {[1,2,3,4].map(r => <option key={r} value={`Room ${r}`}>ห้อง {r}</option>)}
                  </select>
              </div>
          </div>
      </div>

      <div className="grid gap-4">
        {filteredSubmissions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] border-4 border-dashed border-indigo-50 shadow-inner">
             <p className="text-7xl mb-6">🏜️</p>
             <p className="text-indigo-300 font-bold italic font-kids text-xl">ไม่พบข้อมูลงานที่หนูหาจ้า</p>
          </div>
        ) : filteredSubmissions.map((sub) => {
          const uniqueId = `${sub.sheetName}-${sub.rowId}`;
          return (
          <div key={uniqueId} id={`editor-${uniqueId}`} className={`p-6 rounded-[2.5rem] border-4 transition-all relative overflow-hidden ${sub.review?.status === 'Graded' ? 'border-green-100 bg-white' : 'bg-white border-indigo-100 shadow-xl'}`}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-md border-2 ${sub.activityType === 'Sports Day' ? 'bg-orange-100 border-orange-200' : 'bg-cyan-100 border-cyan-200'}`}>
                   {sub.activityType === 'Sports Day' ? '🏃' : '🎈'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-700">{sub.name}</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">เลขที่ {sub.studentNumber} | {sub.grade === 'Prathom 5' ? 'ป.5' : 'ป.6'} | {sub.room.replace('Room ','ห้อง ')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={sub.fileUrl} target="_blank" className="bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold shadow-md hover:bg-indigo-600 transition-all text-sm flex items-center gap-2">ดูวิดีโอ 📺</a>
                <button onClick={() => startGrading(sub)} className={`px-6 py-2 rounded-xl font-bold shadow-md transition-all text-sm text-white ${sub.review?.status === 'Graded' ? 'bg-green-500' : 'bg-orange-400'}`}>
                  {sub.review?.status === 'Graded' ? `ตรวจแล้ว (${sub.review.totalScore}/20)` : 'ประเมินงาน ✍️'}
                </button>
              </div>
            </div>

            {editingId === uniqueId && (
              <div className="mt-6 p-6 bg-indigo-50 rounded-[2rem] border-4 border-indigo-100 shadow-inner animate-in slide-in-from-top duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                   <h4 className="text-lg font-kids text-indigo-700 flex items-center gap-2">📑 แบบประเมินรูบริกรายคน</h4>
                   <button onClick={handleAutoGrade} disabled={isAutoGrading} className="bg-yellow-400 text-indigo-900 px-5 py-2 rounded-xl font-black text-xs shadow-md disabled:opacity-50 transition-all hover:scale-105 active:scale-95">
                    {isAutoGrading ? '🪄 กำลังวิเคราะห์ผลงาน...' : '🪄 ให้ AI ประเมินเบื้องต้น'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PointSelector label="ความถูกต้องเนื้อหา" icon="✅" current={rubric.contentAccuracy} onSelect={(v) => updateRubricItem('contentAccuracy', v)}/>
                  <PointSelector label="การมีส่วนร่วม" icon="🤝" current={rubric.participation} onSelect={(v) => updateRubricItem('participation', v)}/>
                  <PointSelector label="การนำเสนอ" icon="🎤" current={rubric.presentation} onSelect={(v) => updateRubricItem('presentation', v)}/>
                  <PointSelector label="ระเบียบวินัย" icon="📏" current={rubric.discipline} onSelect={(v) => updateRubricItem('discipline', v)}/>
                </div>
                <div className="mt-6">
                  <label className="block text-xs font-bold text-indigo-300 mb-2 ml-2 tracking-widest uppercase">คำติชมคุณครู (ภาษาไทย)</label>
                  <textarea value={rubric.comment} onChange={(e) => updateRubricItem('comment', e.target.value)} className="w-full p-4 rounded-2xl h-24 border-4 border-indigo-100 outline-none text-sm focus:border-indigo-400 transition-all shadow-inner bg-white font-medium" placeholder="เขียนคำแนะนำดีๆ ให้นักเรียนตรงนี้จ๊ะ..."/>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 mt-6">
                  <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-500 text-white font-kids text-xl py-4 rounded-2xl shadow-xl hover:scale-[1.01] active:scale-95 transition-all border-b-6 border-indigo-700">
                    {saving ? 'กำลังบันทึกคะแนน...' : 'บันทึกคะแนนเรียบร้อย! 💾'}
                  </button>
                  <button onClick={() => setEditingId(null)} className="bg-white text-gray-400 px-8 py-4 rounded-2xl border-4 border-gray-100 font-bold hover:bg-gray-50 transition-all">ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
};

export default TeacherView;
