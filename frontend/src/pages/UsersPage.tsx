import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'; import {useState} from 'react'; import {isAxiosError} from 'axios'; import {api} from '../lib/api'; import {useAuth,canManageUsers,roleLabel} from '../context/AuthContext'; import {LoadingState,ErrorState} from '../components/feedback/StateView'; import {ResourceTable} from '../components/tables/ResourceTable'; import {StatusBadge} from '../components/ui/StatusBadge';

interface UserRow{id:number;username:string;email:string;full_name:string;role:string;district:number|null;branch:number|null;district_name:string|null;branch_name:string|null;is_active:boolean}
const list=<T,>(path:string)=>api.get<T[]|{results:T[]}>(path).then(r=>Array.isArray(r.data)?r.data:r.data.results);

export default function UsersPage(){
const queryClient=useQueryClient();const {currentUser}=useAuth();
const [error,setError]=useState('');
const users=useQuery({queryKey:['users'],queryFn:()=>list<UserRow>('/users/')});
const toggleActive=useMutation({mutationFn:(u:UserRow)=>api.patch(`/users/${u.id}/`,{is_active:!u.is_active}),onSuccess:()=>{setError('');queryClient.invalidateQueries({queryKey:['users']})},onError:e=>{setError(isAxiosError(e)&&e.response?.data&&typeof (e.response.data as Record<string,unknown>).detail==='string'?String((e.response.data as Record<string,unknown>).detail):'Unable to update the user account.')}});
if(users.isLoading)return <LoadingState label="Loading users…"/>;
if(users.isError)return <ErrorState message="Only administrators may manage users."/>;
const rows=users.data||[];
const canEdit=canManageUsers(currentUser);
const rowActions=(r:UserRow)=>(currentUser?.id===r.id?<small className="muted">Current session</small>:!canEdit?null:<button className="button secondary" disabled={toggleActive.isPending} onClick={()=>toggleActive.mutate(r)}>{r.is_active?'Disable':'Enable'}</button>);
return (<section className="resource-page">
<div className="resource-head"><div><p className="eyebrow accent">ADMINISTRATION / USERS</p><h1>Users</h1><p className="muted">Only ATM support roles are available: Administrator, Supervisor, Technician, Monitoring Officer, and Auditor.</p></div><button className="button secondary" onClick={()=>users.refetch()}>↻ Refresh</button></div>
{error&&<div className="form-error">{error}</div>}
<ResourceTable rows={rows} columns={[
{key:'full_name',label:'User',render:r=><div><strong>{r.full_name||r.username}</strong><small>{r.email}</small></div>},
{key:'role',label:'Role',render:r=><StatusBadge value={roleLabel(r.role).toUpperCase().replaceAll(' ','_')}/>},
{key:'district_name',label:'Scope',render:r=><small>{[r.district_name,r.branch_name].filter(Boolean).join(' · ')||'District-wide'}</small>},
{key:'is_active',label:'Status',render:r=><StatusBadge value={r.is_active?'ACTIVE':'DISABLED'}/>},
{key:'actions',label:'',render:rowActions}
]} />
</section>)
}
