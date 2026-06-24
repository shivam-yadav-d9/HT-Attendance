import BASE_URL from '../api/api';

const authService = {
  login: async (username, password) => {
    try {
      const response = await fetch(
        `${BASE_URL}/users/login-ontrack`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
          }),
        },
      );

      const json = await response.json();

      if (json.success) {
        return {
          success: true,
          user: json.data,
          token: 'dummy-token',
        };
      }

      return {
        success: false,
        message: json.message,
      };
    } catch (e) {
      return {
        success: false,
        message: e.message,
      };
    }
  },
};

export default authService;