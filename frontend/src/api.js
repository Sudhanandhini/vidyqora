import axios from 'axios';

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || ''}/api` });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('vq_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('vq_token');
      window.location.assign('/login');
    }
    // Blob errors (Excel downloads) carry JSON text
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()); } catch { /* ignore */ }
    }
    err.message = err.response?.data?.message || err.message;
    return Promise.reject(err);
  },
);

export async function download(url, params, fallbackName = 'report') {
  const res = await api.get(url, { params, responseType: 'blob' });
  const name = /filename="(.+?)"/.exec(res.headers['content-disposition'] || '')?.[1] || `${fallbackName}.xlsx`;
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
}

export const fileUrl = (p) => `${import.meta.env.VITE_API_URL || ''}${p}`;

export default api;
