import {createContext,useContext,useEffect,useState,ReactNode} from 'react'; import {api} from '../lib/api';

export type UserRole = 'ADMINISTRATOR' | 'SUPERVISOR' | 'TECHNICIAN' | 'MONITORING_OFFICER' | 'AUDITOR';

export interface CurrentUser{id:number;username:string;email:string;full_name:string;role:UserRole;district:number|null;branch:number|null;is_active:boolean;permissions:string[]}

interface AuthState{currentUser:CurrentUser|null;isAuthenticated:boolean;isLoading:boolean;login:(username:string,password:string)=>Promise<CurrentUser>;logout:()=>Promise<void>;refresh:()=>Promise<void>;getUserPermissions:(role:UserRole|string)=>string[];userRole:string|null;hasPermission:(user:CurrentUser|null,permission:string)=>boolean;canManageOrganization:(user:CurrentUser|null)=>boolean;canManageUsers:(user:CurrentUser|null)=>boolean;isSupervisorUser:(user:CurrentUser|null)=>boolean;isTechnicianUser:(user:CurrentUser|null)=>boolean}

const USER_PERMISSIONS:Record<UserRole,string[]> = {
  ADMINISTRATOR: ['incident.view','incident.assign','incident.reassign','incident.verify','incident.close','incident.escalate','incident.resolve','incident.retest','troubleshooting.create','troubleshooting.view','maintenance.view','maintenance.create','maintenance.update','user.view','user.create','user.update','user.disable','role.view','audit.view','notification.manage','district.view','district.create','district.update','district.delete','branch.view','branch.create','branch.update','branch.delete','atm.view','atm.create','atm.update','atm.delete','report.export','incident.create','report.view'],
  SUPERVISOR: ['incident.view','incident.create','incident.assign','incident.reassign','incident.verify','incident.close','incident.escalate','incident.resolve','incident.retest','troubleshooting.create','troubleshooting.view','maintenance.view','maintenance.create','maintenance.update','district.view','branch.view','atm.view','report.view'],
  TECHNICIAN: ['incident.view','incident.create','troubleshooting.create','incident.escalate','incident.resolve','incident.retest','troubleshooting.view','maintenance.view','maintenance.create','maintenance.update','atm.view','report.view'],
  MONITORING_OFFICER: ['incident.view','incident.create','troubleshooting.view','maintenance.view','atm.view','report.view'],
  AUDITOR: ['audit.view','report.view','atm.view','incident.view','troubleshooting.view','maintenance.view']
};

export function hasPermission(user:CurrentUser|null,permission:string){if(!user)return false;return user.permissions.includes(permission)}

export function canManageOrganization(user:CurrentUser|null){if(!user)return false;return user.permissions.includes('district.create')||user.role==='ADMINISTRATOR'}

export function canManageUsers(user:CurrentUser|null){if(!user)return false;return user.permissions.includes('user.create')||user.role==='ADMINISTRATOR'}

export function isSupervisorUser(user:CurrentUser|null){if(!user)return false;return ['ADMINISTRATOR','SUPERVISOR'].includes(user.role)}

export function isTechnicianUser(user:CurrentUser|null){if(!user)return false;return user.role==='TECHNICIAN'||isSupervisorUser(user)}

export function roleLabel(role?:string|null){
  const labels:Record<string,string>={ADMINISTRATOR:'Administrator',SUPERVISOR:'Supervisor',TECHNICIAN:'Technician',MONITORING_OFFICER:'Monitoring Officer',AUDITOR:'Auditor'};
  return role?labels[role]||role.replaceAll('_',' '):'';
}

const AuthContext=createContext<AuthState|undefined>(undefined);

export function AuthProvider({children}:{children:ReactNode}){
const [currentUser,setCurrentUser]=useState<CurrentUser|null>(null);
const [isLoading,setLoading]=useState<boolean>(Boolean(localStorage.getItem('cbe_access_token')));

async function fetchMe():Promise<CurrentUser>{const {data}=await api.get<CurrentUser>('/auth/me/');setCurrentUser(data);return data}

useEffect(()=>{if(localStorage.getItem('cbe_access_token')){fetchMe().catch(()=>{localStorage.removeItem('cbe_access_token');localStorage.removeItem('cbe_refresh_token')}).finally(()=>setLoading(false))}},[]);

async function login(username:string,password:string){
  const {data}=await api.post('/auth/token/',{username,password});
  localStorage.setItem('cbe_access_token',data.access);
  localStorage.setItem('cbe_refresh_token',data.refresh);
  try{return await fetchMe()}catch(e){await logout();throw e}
}

async function logout(){
  const refresh=localStorage.getItem('cbe_refresh_token');
  try{if(refresh)await api.post('/auth/logout/',{refresh})}catch{/* token may already be expired */}
  localStorage.removeItem('cbe_access_token');
  localStorage.removeItem('cbe_refresh_token');
  setCurrentUser(null)
}

function getUserPermissions(role:UserRole|string){
  const userRole=role as UserRole;
  return USER_PERMISSIONS[userRole]||USER_PERMISSIONS.AUDITOR
}

return <AuthContext.Provider value={{currentUser,isAuthenticated:Boolean(currentUser),isLoading,login,logout,refresh:async()=>{await fetchMe()},getUserPermissions,userRole:currentUser?.role || null,hasPermission,canManageOrganization,canManageUsers,isSupervisorUser,isTechnicianUser}}>{children}</AuthContext.Provider>
}

export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('useAuth must be used inside AuthProvider');return ctx}
