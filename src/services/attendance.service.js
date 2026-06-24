import BASE_URL from '../api/api';

const attendanceService = {
  checkIn: async (employeeId, lat, lang) => {
    try {
      const response = await fetch(
        `${BASE_URL}/ontrack/attendance/check-in`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            employeeId,
            lat,
            lang,
          }),
        },
      );

      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  },

  checkOut: async (employeeId, lat, lang) => {
    try {
      const response = await fetch(
        `${BASE_URL}/ontrack/attendance/check-out`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            employeeId,
            lat,
            lang,
          }),
        },
      );

      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  },

  getAttendanceHistory: async employeeId => {
    try {
      const response = await fetch(
        `${BASE_URL}/ontrack/attendance/${employeeId}`,
      );

      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  },
};

export default attendanceService;