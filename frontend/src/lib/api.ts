import axios,{AxiosError} from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_BASE_URL||'/api'});
const AUTH_PATHS=['/auth/token/','/auth/token/refresh/','/auth/logout/'];
api.interceptors.request.use(config=>{const token=localStorage.getItem('cbe_access_token');if(token)config.headers.Authorization=`Bearer ${token}`;return config});
let refreshing:Promise<string|null>|null=null;
async function refreshAccessToken():Promise<string|null>{
const refresh=localStorage.getItem('cbe_refresh_token');
if(!refresh)return null;
try{const {data}=await axios.post(`${api.defaults.baseURL}/auth/token/refresh/`,{refresh});
localStorage.setItem('cbe_access_token',data.access);
if(data.refresh)localStorage.setItem('cbe_refresh_token',data.refresh);
return data.access}catch{return null}}
function clearSession(){localStorage.removeItem('cbe_access_token');localStorage.removeItem('cbe_refresh_token')}
api.interceptors.response.use(r=>r,async (error:AxiosError)=>{
const original=request(error);const status=error.response?.status;const path=original?.url||'';
if(status===401&&!AUTH_PATHS.some(p=>path.endsWith(p))){
if(!refreshing)refreshing=refreshAccessToken().finally(()=>{setTimeout(()=>{refreshing=null},0)});
const token=await refreshing;
if(token&&original){original.headers=original.headers||{};original.headers.Authorization=`Bearer ${token}`;return api(original)}
clearSession();
if(!window.location.pathname.startsWith('/login'))window.location.href='/login'}
return Promise.reject(error)});
function request(error:AxiosError){return error.config as (typeof error.config & {url?:string})|undefined}
