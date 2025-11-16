interface Meeting {
  id: number;
  start: string;
  end: string;
}

function scheduleMeetings(meetings: Meeting[]): { scheduled: number[]; count: number } {
  const sorted = meetings
    .map(m => ({
      ...m,
      startMin: timeToMinutes(m.start),
      endMin: timeToMinutes(m.end)
    }))
    .sort((a, b) => a.endMin - b.endMin);

  const scheduled: number[] = [];
  let lastEnd = -1;

  for (const m of sorted) {
    if (m.startMin >= lastEnd) {
      scheduled.push(m.id);
      lastEnd = m.endMin;
    }
  }

  return { scheduled, count: scheduled.length };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Test
const input: Meeting[] = [
  { id: 1, start: "09:00", end: "10:30" },
  { id: 2, start: "09:45", end: "11:00" },
  { id: 3, start: "10:40", end: "12:00" },
  { id: 4, start: "13:00", end: "14:00" }
];

console.log(scheduleMeetings(input));