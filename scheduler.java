import java.util.*;

public class MeetingScheduler {

    static class Meeting {
        int id;
        String start;
        String end;
        int startMinutes;
        int endMinutes;

        public Meeting(int id, String start, String end) {
            this.id = id;
            this.start = start;
            this.end = end;
            this.startMinutes = timeToMinutes(start);
            this.endMinutes = timeToMinutes(end);
        }
    }

    private static int timeToMinutes(String time) {
        String[] parts = time.split(":");
        int hours = Integer.parseInt(parts[0]);
        int minutes = Integer.parseInt(parts[1]);
        return hours * 60 + minutes;
    }

    public static Map<String, Object> scheduleMeetings(List<Map<String, String>> input) {
        List<Meeting> meetings = new ArrayList<>();

        for (Map<String, String> m : input) {
            int id = Integer.parseInt(m.get("id"));
            String start = m.get("start");
            String end = m.get("end");
            meetings.add(new Meeting(id, start, end));
        }

        meetings.sort(Comparator.comparingInt(m -> m.endMinutes));

        List<Integer> scheduledIds = new ArrayList<>();
        int lastEndTime = -1;

        for (Meeting meeting : meetings) {
            if (meeting.startMinutes >= lastEndTime) {
                scheduledIds.add(meeting.id);
                lastEndTime = meeting.endMinutes;
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("scheduled", scheduledIds);
        result.put("count", scheduledIds.size());
        return result;
    }

    public static void main(String[] args) {
        List<Map<String, String>> input = Arrays.asList(
            Map.of("id", "1", "start", "09:00", "end", "10:30"),
            Map.of("id", "2", "start", "09:45", "end", "11:00"),
            Map.of("id", "3", "start", "10:40", "end", "12:00"),
            Map.of("id", "4", "start", "13:00", "end", "14:00")
        );

        Map<String, Object> result = scheduleMeetings(input);
        System.out.println("Scheduled Meetings: " + result.get("scheduled"));
        System.out.println("Total Count: " + result.get("count"));
    }
}