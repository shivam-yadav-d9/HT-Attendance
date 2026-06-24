import BASE_URL from '../api/api';

const dashboardService = {
  getEmployeeDashboard: async employeeNumber => {
    try {
      const response = await fetch(
        `${BASE_URL}/ontrack/emp-dashboard/${employeeNumber}`,
      );

      const json = await response.json();

      return json;
    } catch (error) {
      console.log('Dashboard Error : ', error);

      return {
        success: false,
        message: error.message,
      };
    }
  },
};

export default dashboardService;