import axios from "axios";

const BASE_URL = "https://shopsphere-4c0v.onrender.com/api";

const axiosInstance = axios.create({ 
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

let refreshInFlight = null;

// Request Interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    // Do NOT run refresh logic for login/register endpoints!
    const isAuthEndpoint = ["/auth/login", "/auth/register", "/auth/refresh-token"].some((path) =>
      originalRequest.url?.includes(path)
    );

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const currentAccessToken = localStorage.getItem("accessToken");
      const sentAuthorization = originalRequest.headers?.Authorization || originalRequest.headers?.get?.("Authorization");
      if (currentAccessToken && sentAuthorization && sentAuthorization !== `Bearer ${currentAccessToken}`) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${currentAccessToken}`;
        return axiosInstance(originalRequest);
      }
      try {
        if (!refreshInFlight) {
          refreshInFlight = (async () => {
            const refreshToken = localStorage.getItem("refreshToken");
            if (!refreshToken) throw new Error("No refresh token available");
            const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, { refreshToken });
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            return data.accessToken;
          })().finally(() => {
            refreshInFlight = null;
          });
        }
        const accessToken = await refreshInFlight;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        return axiosInstance(originalRequest);
      } catch (refreshErr) {
        // Clear storage without triggering hard reload on auth pages
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
