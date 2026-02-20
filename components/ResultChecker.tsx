
import React, { useState, useMemo, useEffect } from 'react';
import { StudentSubmission } from '../types';

interface ResultCheckerProps {
  submissions: StudentSubmission[];
  refreshData?: () => void;
}

const ResultChecker: React.FC<ResultCheckerProps> = ({ submissions, refreshData }) => {
  const [searchName, setSearchName] = useState('');
  const [searchGrade, setSearchGrade] = useState('Prathom 5');
  const [searchRoom, setSearchRoom] = useState('Room 1');
  const [searchActivity, setSearchActivity] = useState<'Sports Day' | 'Children Day'>('Sports Day');
  const [hasSearched, setHasSearched] = useState(false);

  const result = useMemo(() => {
    if (!hasSearched) return null;
    return submissions.find(s => 
      s.name.toLowerCase().includes(searchName.toLowerCase().trim()) && 
      s.grade === searchGrade && 
      s.room === searchRoom &&
      s.activityType === searchActivity
    );
  }, [submissions, searchName, searchGrade, searchRoom, searchActivity, hasSearched]);

  useEffect(() => {
    let interval: number;
    if (hasSearched && result && !result.review && refreshData) {
      interval = window.setInterval(() => {
        refreshData();
      }, 20000);
    }
    return () => clearInterval(interval);
  }, [hasSearched, result, refreshData]);

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="text-center animate-in fade-in slide-in-from-top duration-700">
        <div className="text-7xl mb-4">📜</div>
        <h2 className="text-4xl font-kids text-indigo-600">ตรวจสอบผลการเรียน</h2>
        <p className="text-gray-500 font-bold italic">"พิมพ์ชื่อของหนูเพื่อรับเกียรติบัตรคะแนนดิจิทัลนะจ๊ะ"</p>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border-4 border-indigo-100 shadow-xl space-y-6">
        <div className="space-y-4">
          <label className="block text-sm font-bold text-indigo-700 ml-2">หนูต้องการดูคะแนนกิจกรรมไหนจ๊ะ?</label>
          <div className="flex gap-4">
            <button 
              onClick={() => { setSearchActivity('Sports Day'); setHasSearched(false); }}
              className={`flex-1 py-3 rounded-2xl font-bold transition-all border-4 ${searchActivity === 'Sports Day' ? 'bg-orange-500 text-white border-orange-200 shadow-lg' : 'bg-white text-orange-400 border-slate-50'}`}
            >
              🏃 กีฬาสี
            </button>
            <button 
              onClick={() => { setSearchActivity('Children Day'); setHasSearched(false); }}
              className={`flex-1 py-3 rounded-2xl font-bold transition-all border-4 ${searchActivity === 'Children Day' ? 'bg-cyan-500 text-white border-cyan-200 shadow-lg' : 'bg-white text-cyan-400 border-slate-50'}`}
            >
              🎈 วันเด็ก
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-bold text-indigo-700 mb-2 ml-2">พิมพ์ชื่อ-นามสกุล ของหนู 🧑‍🎓</label>
            <input 
              type="text" 
              value={searchName}
              onChange={(e) => { setSearchName(e.target.value); setHasSearched(false); }}
              className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-indigo-50 outline-none text-xl font-bold text-indigo-700 focus:border-indigo-400 transition-all shadow-inner"
              placeholder="เด็กชาย/เด็กหญิง..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-indigo-700 mb-2 ml-2">ระดับชั้น</label>
              <select 
                value={searchGrade}
                onChange={(e) => { setSearchGrade(e.target.value); setHasSearched(false); }}
                className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-indigo-50 outline-none font-bold shadow-inner cursor-pointer"
              >
                <option value="Prathom 5">ป.5</option>
                <option value="Prathom 6">ป.6</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-indigo-700 mb-2 ml-2">ห้อง</label>
              <select 
                value={searchRoom}
                onChange={(e) => { setSearchRoom(e.target.value); setHasSearched(false); }}
                className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-indigo-50 outline-none font-bold shadow-inner cursor-pointer"
              >
                {[1,2,3,4].map(r => <option key={r} value={`Room ${r}`}>ห้อง {r}</option>)}
              </select>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setHasSearched(true)}
          className={`w-full text-white font-kids text-2xl py-5 rounded-2xl shadow-xl transition-all border-b-8 active:border-b-0 active:translate-y-1 ${
            searchActivity === 'Sports Day' ? 'bg-indigo-500 border-indigo-700 hover:bg-indigo-600' : 'bg-pink-500 border-pink-700 hover:bg-pink-600'
          }`}
        >
          ยืนยันการตรวจสอบผล! ✨
        </button>
      </div>

      {hasSearched && (
        <div className="animate-in fade-in zoom-in duration-500">
          {!result ? (
            <div className="text-center p-12 bg-white rounded-[3rem] border-4 border-dashed border-gray-100">
              <p className="text-6xl mb-4">🚫</p>
              <p className="text-xl text-gray-400 font-bold italic">ไม่พบรายชื่อของหนูในระบบจ้า... ตรวจสอบตัวสะกดดูอีกทีนะจ๊ะ</p>
            </div>
          ) : !result.review ? (
            <div className="text-center p-12 bg-blue-50 rounded-[3rem] border-4 border-blue-200">
              <p className="text-6xl mb-4">⏳</p>
              <p className="text-2xl text-blue-600 font-bold">ได้รับงานของหนูแล้ว!</p>
              <p className="text-blue-400 font-bold mt-2 italic">กำลังรอคุณครูตรวจสอบความเรียบร้อยนะจ๊ะ... กลับมาดูใหม่อีกครั้งจ้า ✨</p>
            </div>
          ) : (
            <div className={`bg-white p-1 md:p-10 rounded-[4rem] border-8 shadow-2xl relative overflow-hidden ${searchActivity === 'Sports Day' ? 'border-orange-100' : 'border-cyan-100'}`}>
              <div className="bg-white p-8 rounded-[3.5rem] border-2 border-gray-50 text-center">
                <div className="flex justify-center mb-6">
                    <div className="w-24 h-24 bg-yellow-400 rounded-full flex items-center justify-center text-5xl shadow-lg animate-pulse">👑</div>
                </div>
                <h3 className="text-2xl md:text-3xl font-kids text-indigo-700 mb-2">ยินดีด้วยนะจ๊ะ {result.name}!</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-8">ใบสรุปคะแนนกิจกรรมวิชาสุขศึกษาและพลศึกษา</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-6 rounded-3xl text-center shadow-inner border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">คะแนนรวม</p>
                    <p className="text-5xl font-kids text-indigo-600">{result.review.totalScore}<span className="text-xl">/20</span></p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl text-center shadow-inner border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">คิดเป็นร้อยละ</p>
                    <p className="text-5xl font-kids text-indigo-600">{result.review.percentage}<span className="text-xl">%</span></p>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  <p className="text-xs font-black text-indigo-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                    <span className="text-lg">💌</span> คำแนะนำจากคุณครู
                  </p>
                  <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] border-l-8 border-indigo-400 italic text-lg md:text-xl text-slate-700 leading-relaxed shadow-inner">
                    "{result.review.comment}"
                  </div>
                </div>

                <div className="mt-10 pt-6 border-t-2 border-dashed border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">วันที่ประเมินผล</p>
                        <p className="text-sm font-bold text-gray-500">{new Date(result.review.gradedAt || Date.now()).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div className="bg-green-100 text-green-600 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest">
                        สถานะ: ผ่านการประเมิน ✅
                    </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultChecker;
