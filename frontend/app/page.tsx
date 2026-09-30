'use client';

import { useState, useEffect } from 'react';

interface CourseSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  startTime: string;
  endTime: string;
}

interface RoomStatus {
  roomName: string;
  isOccupied: boolean;
  statusColor: 'red' | 'green';
  currentClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
  } | null;
  nextClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
    startTime: string;
  } | null;
  allSchedules?: CourseSchedule[];
}

interface StudentBooking {
  id: string;
  roomName: string;
  studentName: string;
  peopleCount: number;
  bookedAt: string;
}

export default function Home() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomStatus | null>(null);

  const [allBookings, setAllBookings] = useState<StudentBooking[]>([]);
  const [peopleInput, setPeopleInput] = useState<number>(1);
  const [showMyBookingsModal, setShowMyBookingsModal] = useState(false);

  // ดึงข้อมูลสถานะห้องจาก Backend (พอร์ต 3003)
  useEffect(() => {
    let isMounted = true;

    const getRoomStatus = async () => {
      try {
        const res = await fetch('http://localhost:3003/api/v1/schedules/status');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        if (isMounted) {
          const updatedRooms = Array.isArray(data) ? data : [];
          
          // กรองเอาเฉพาะห้องที่มีตารางเรียน (allSchedules มีค่ามากกว่า 0) 
          // หรือห้องที่มีคนจองแล้ว เพื่อไม่ให้ห้องเปล่าๆ (lab1, lab2, lab3 ที่ไม่มีวิชา) โผล่มาค้าง
          const activeRooms = updatedRooms.filter(
            (r) => (r.allSchedules && r.allSchedules.length > 0) || 
                   allBookings.some((b) => b.roomName === r.roomName)
          );

          setRooms(activeRooms);

          setSelectedRoom((prevSelected) => {
            if (!prevSelected) return null;
            return activeRooms.find((r) => r.roomName === prevSelected.roomName) || null;
          });
        }
      } catch (err) {
        console.error('Error fetching room status:', err);
        if (isMounted) {
          setRooms([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getRoomStatus();

    return () => {
      isMounted = false;
    };
  }, [allBookings]);

  // ฟังก์ชันรีโหลดข้อมูล
  const handleReload = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3003/api/v1/schedules/status');
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      const updatedRooms = Array.isArray(data) ? data : [];
      
      const activeRooms = updatedRooms.filter(
        (r) => (r.allSchedules && r.allSchedules.length > 0) || 
               allBookings.some((b) => b.roomName === r.roomName)
      );

      setRooms(activeRooms);
    } catch (err) {
      console.error('Error fetching room status:', err);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const roomBookings = selectedRoom
    ? allBookings.filter((b) => b.roomName === selectedRoom.roomName)
    : [];

  const totalGroups = roomBookings.length;
  const totalPeopleInRoom = roomBookings.reduce((sum, b) => sum + b.peopleCount, 0);
  const isRoomFull = totalGroups >= 3 || totalPeopleInRoom >= 45;

  const handleBooking = (roomName: string) => {
    if (peopleInput < 1 || peopleInput > 15) {
      alert('⚠️ สามารถจองได้ครั้งละไม่เกิน 1 - 15 คน ต่อ 1 สิทธิ์การจองครับ');
      return;
    }

    if (totalGroups >= 3) {
      alert('⚠️ ห้องนี้ถูกจองเต็มสิทธิ์แล้ว (สูงสุด 3 กลุ่มต่อห้อง)');
      return;
    }

    if (totalPeopleInRoom + peopleInput > 45) {
      alert(`⚠️ จำนวนคนเกินโควตาห้อง! (ปัจจุบันมี ${totalPeopleInRoom} คน เหลือรองรับได้อีก ${45 - totalPeopleInRoom} คน)`);
      return;
    }

    const newBooking: StudentBooking = {
      id: Date.now().toString(),
      roomName: roomName,
      studentName: 'คุณ (นักศึกษา)',
      peopleCount: Number(peopleInput),
      bookedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
    };

    setAllBookings((prev) => [...prev, newBooking]);
    alert(`✅ จองห้อง ${roomName} สำเร็จ! สำหรับ ${peopleInput} คน`);
    setPeopleInput(1);
  };

  const handleCancelBooking = (bookingId: string) => {
    setAllBookings((prev) => prev.filter((item) => item.id !== bookingId));
    alert('❌ ยกเลิกการจองเรียบร้อยแล้ว');
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8 text-slate-900">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-700">
              🏫 ระบบจองห้องปฏิบัติการ
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              ดูสถานะห้องปฏิบัติการแบบ Real-time และเลือกจองห้องสำหรับนักศึกษา
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMyBookingsModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              📋 การจองของฉัน ({allBookings.filter((b) => b.studentName.includes('คุณ')).length})
            </button>
          </div>
        </div>

        {/* รายการห้องปฏิบัติการ */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 text-slate-800">รายการห้องปฏิบัติการ</h2>

          {loading ? (
            <p className="text-slate-400 text-sm py-4">กำลังดึงสถานะห้อง...</p>
          ) : !Array.isArray(rooms) || rooms.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-500 text-sm">ยังไม่มีห้องปฏิบัติการที่มีตารางเรียนในขณะนี้</p>
              <button 
                onClick={handleReload}
                className="mt-3 text-xs text-blue-600 font-semibold underline"
              >
                รีเฟรชสถานะ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {rooms.map((room) => {
                const currentBookings = allBookings.filter((b) => b.roomName === room.roomName);
                const countGroups = currentBookings.length;

                return (
                  <div
                    key={room.roomName}
                    onClick={() => setSelectedRoom(room)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition cursor-pointer bg-white shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-3.5 h-3.5 rounded-full ${
                          room.isOccupied ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                        }`}
                      ></span>
                      <div>
                        <span className="font-bold text-base sm:text-lg text-slate-800">
                          {room.roomName}
                        </span>
                        {countGroups > 0 && (
                          <p className="text-xs text-blue-600 font-medium mt-0.5">
                            👥 มีผู้จองแล้ว {countGroups}/3 กลุ่ม (คลิกเพื่อดูรายละเอียด)
                          </p>
                        )}
                        {room.nextClass && !room.isOccupied && (
                          <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                            ⚠️ มีเรียนต่อเวลา {room.nextClass.startTime} น. ({room.nextClass.courseCode})
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="text-xs sm:text-sm font-medium text-blue-600 underline">
                      ดูรายละเอียด
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal รายละเอียดห้อง */}
        {selectedRoom && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4 border-b pb-3">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      selectedRoom.isOccupied ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                  ></span>
                  {selectedRoom.roomName}
                </h3>
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg px-1"
                >
                  ✕
                </button>
              </div>

              {selectedRoom.isOccupied && selectedRoom.currentClass ? (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-4">
                  <span className="inline-block bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold mb-2">
                    🔴 กำลังใช้งาน (ติดเรียน)
                  </span>
                  <p className="text-sm font-semibold text-red-900 mt-1">
                    วิชา: {selectedRoom.currentClass.courseCode}{' '}
                    {selectedRoom.currentClass.courseName}
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    ผู้สอน: {selectedRoom.currentClass.instructorName}
                  </p>
                  <p className="text-xs text-red-700 mt-1 font-mono">
                    เวลาเรียน: {selectedRoom.currentClass.time}
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-4">
                  <span className="inline-block bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-full font-bold mb-2">
                    🟢 ห้องว่างอยู่ตอนนี้
                  </span>
                  {selectedRoom.nextClass ? (
                    <p className="text-xs text-emerald-800 mt-1">
                      💡 ใช้ห้องได้ถึงเวลา{' '}
                      <span className="font-bold text-sm text-amber-700 underline">
                        {selectedRoom.nextClass.startTime} น.
                      </span>{' '}
                      (เพราะมีเรียนต่อวิชา {selectedRoom.nextClass.courseCode})
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-800 mt-1">
                      ไม่มีการเรียนการสอนต่อในช่วงเวลาที่เหลือของวัน
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-b border-slate-100 py-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-bold text-slate-800">
                    👥 รายการกลุ่มที่จองห้องนี้ ({totalGroups}/3 กลุ่ม)
                  </h4>
                  <span className="text-xs font-semibold text-blue-600">
                    รวม {totalPeopleInRoom}/45 คน
                  </span>
                </div>

                {roomBookings.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1">ยังไม่มีกลุ่มใดจองห้องนี้ สามารถจองเป็นกลุ่มแรกได้เลย</p>
                ) : (
                  <div className="space-y-2">
                    {roomBookings.map((b, idx) => (
                      <div
                        key={b.id}
                        className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-slate-700">กลุ่มที่ {idx + 1}: {b.studentName}</span>
                          <p className="text-slate-500 text-[11px]">เวลาที่จอง: {b.bookedAt}</p>
                        </div>
                        <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">
                          {b.peopleCount} คน
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!selectedRoom.isOccupied && (
                <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100 mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    กรอกจำนวนคนที่มาด้วยกัน (สูงสุด 15 คน/การจอง 1 ครั้ง):
                  </label>
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={peopleInput}
                      onChange={(e) => setPeopleInput(Math.min(15, Math.max(1, Number(e.target.value))))}
                      className="w-24 p-2 text-sm border rounded-lg text-center font-bold text-slate-800"
                    />
                    <span className="text-xs text-slate-500">
                      (จองได้อีก {3 - totalGroups} กลุ่ม)
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition text-sm"
                >
                  ปิด
                </button>
                <button
                  disabled={selectedRoom.isOccupied || isRoomFull}
                  onClick={() => handleBooking(selectedRoom.roomName)}
                  className={`flex-1 font-semibold py-2.5 rounded-xl text-sm shadow-md transition ${
                    selectedRoom.isOccupied || isRoomFull
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {selectedRoom.isOccupied
                    ? 'ห้องติดเรียน'
                    : isRoomFull
                    ? 'สิทธิ์จองเต็มแล้ว'
                    : `จองห้อง (${peopleInput} คน)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal รายการจองของฉัน */}
        {showMyBookingsModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-100">
              <div className="flex justify-between items-center mb-4 border-b pb-3">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  📋 รายการจองห้องของฉัน
                </h3>
                <button
                  onClick={() => setShowMyBookingsModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              {allBookings.filter((b) => b.studentName.includes('คุณ')).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  คุณยังไม่มีรายการจองห้องปฏิบัติการ
                </div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto mb-4 pr-1">
                  {allBookings
                    .filter((b) => b.studentName.includes('คุณ'))
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-blue-900 text-base">
                            ห้อง {item.roomName} ({item.peopleCount} คน)
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            จองเมื่อเวลา: {item.bookedAt}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCancelBooking(item.id)}
                          className="text-xs bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 px-3 rounded-lg transition shadow-sm"
                        >
                          ยกเลิกการจอง
                        </button>
                      </div>
                    ))}
                </div>
              )}

              <button
                onClick={() => setShowMyBookingsModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition text-sm"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}