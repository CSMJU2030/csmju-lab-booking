'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface CourseSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
}

interface RoomStatusResponse {
  roomName: string;
  allSchedules?: CourseSchedule[];
}

export default function InstructorDashboard() {
  const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    instructorName: '',
    courseCode: '',
    courseName: '',
    roomName: 'lab1',
    day: 'MONDAY',
    startTime: '09:00',
    endTime: '12:00',
  });

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3003/api/v1/schedules/status');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: RoomStatusResponse[] = await res.json();
      
      const allSch: CourseSchedule[] = [];
      if (Array.isArray(data)) {
        data.forEach((room) => {
          if (room.allSchedules && Array.isArray(room.allSchedules)) {
            room.allSchedules.forEach((sch) => {
              allSch.push({
                ...sch,
                roomName: room.roomName,
              });
            });
          }
        });
      }
      return allSch;
    } catch (err) {
      console.error('Error fetching schedules:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetchSchedules().then((nextSchedules) => {
      if (isCurrent) {
        setSchedules(nextSchedules);
        setLoading(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [fetchSchedules]);

  const refreshSchedules = async () => {
    setSchedules(await fetchSchedules());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.roomName.trim()) {
      alert('กรุณากรอกชื่อห้องปฏิบัติการ');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:3003/api/v1/schedules', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': 'INSTRUCTOR',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        alert('✅ บันทึกข้อมูลรายวิชาเรียบร้อยแล้ว!');
        setFormData({
          instructorName: '',
          courseCode: '',
          courseName: '',
          roomName: 'lab1',
          day: 'MONDAY',
          startTime: '09:00',
          endTime: '12:00',
        });
        await refreshSchedules();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`❌ เกิดข้อผิดพลาด: ${errorData.message || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, courseCode: string) => {
    if (!confirm(`ต้องการลบวิชา ${courseCode} ออกจากระบบใช่หรือไม่?`)) return;

    try {
      const res = await fetch(`http://localhost:3003/api/v1/schedules/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'INSTRUCTOR',
        },
      });

      if (res.ok) {
        alert('🗑️ ลบตารางวิชาเรียบร้อยแล้ว');
        await refreshSchedules();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`❌ ไม่สามารถลบได้: ${errorData.message || 'สิทธิ์ไม่เพียงพอ'}`);
      }
    } catch (err) {
      console.error(err);
      alert('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-900">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              👨‍🏫 ระบบจัดการตารางสอน (สำหรับอาจารย์ / Admin)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              เพิ่มและจัดการตารางเรียนห้องปฏิบัติการด้วยสิทธิ์ผู้ดูแลระบบ
            </p>
          </div>
          <Link
            href="/"
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            ← กลับหน้าหลักนักศึกษา
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
            <h2 className="text-base font-bold text-slate-800 mb-4">➕ เพิ่มตารางเรียนใหม่</h2>
            
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้สอน</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น อ.ดร.สมชาย ใจดี"
                  value={formData.instructorName}
                  onChange={(e) => setFormData({ ...formData, instructorName: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">รหัสวิชา</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น คม327"
                    value={formData.courseCode}
                    onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ห้องปฏิบัติการ</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น lab1"
                    value={formData.roomName}
                    onChange={(e) => setFormData({ ...formData, roomName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อวิชา</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น การพัฒนาเว็บแอปพลิเคชัน"
                  value={formData.courseName}
                  onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">วันในสัปดาห์</label>
                <select
                  value={formData.day}
                  onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="MONDAY">วันจันทร์</option>
                  <option value="TUESDAY">วันอังคาร</option>
                  <option value="WEDNESDAY">วันพุธ</option>
                  <option value="THURSDAY">วันพฤหัสบดี</option>
                  <option value="FRIDAY">วันศุกร์</option>
                  <option value="SATURDAY">วันเสาร์</option>
                  <option value="SUNDAY">วันอาทิตย์</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">เวลาเริ่มต้น</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">เวลาสิ้นสุด</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition text-sm shadow-md mt-2 disabled:bg-slate-400"
              >
                {submitting ? 'กำลังบันทึก...' : '💾 บันทึกตารางสอน'}
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-base font-bold text-slate-800 mb-4">📋 รายการตารางเรียนในระบบทั้งหมด</h2>

            {loading ? (
              <p className="text-xs text-slate-400">กำลังโหลดข้อมูล...</p>
            ) : schedules.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">ยังไม่มีตารางเรียนในระบบ</p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {schedules.map((sch) => (
                  <div key={sch.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-blue-700 text-sm">
                        {sch.courseCode} - {sch.courseName}
                      </span>
                      <p className="text-slate-600 mt-0.5">ห้อง: <strong className="text-slate-800">{sch.roomName}</strong> | ผู้สอน: {sch.instructorName}</p>
                      <p className="font-mono text-[11px] text-slate-500 mt-1">
                        🗓️ {sch.day} ({sch.startTime} - {sch.endTime} น.)
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(sch.id, sch.courseCode)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-2.5 py-1.5 rounded-lg transition"
                    >
                      🗑️ ลบ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}