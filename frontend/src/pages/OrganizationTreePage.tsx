import {useQuery} from '@tanstack/react-query'; import {useState} from 'react'; import {api} from '../lib/api'; import {LoadingState,ErrorState,EmptyState} from '../components/feedback/StateView'; import {StatusBadge} from '../components/ui/StatusBadge';

interface District{id:number;name:string;code:string;status:string}
interface Branch{id:number;name:string;code:string;status:string;district:number;district_name:string}
interface ATM{id:number;reference:string;status:string;branch:number}

function useOrgData(){
const districts=useQuery({queryKey:['districts','tree'],queryFn:()=>api.get<District[]|{results:District[]}>('/districts/').then(r=>Array.isArray(r.data)?r.data:r.data.results)});
const branches=useQuery({queryKey:['branches','tree'],queryFn:()=>api.get<Branch[]|{results:Branch[]}>('/branches/').then(r=>Array.isArray(r.data)?r.data:r.data.results)});
const atms=useQuery({queryKey:['atms','tree'],queryFn:()=>api.get<ATM[]|{results:ATM[]}>('/atms/').then(r=>Array.isArray(r.data)?r.data:r.data.results)});
return {districts,branches,atms,isLoading:districts.isLoading||branches.isLoading||atms.isLoading,isError:districts.isError||branches.isError||atms.isError}}

function TreeSection({label,count,children}:{label:string;count?:number;children?:React.ReactNode}){
const [open,setOpen]=useState(true);
return <div className="tree-node"><button className="tree-toggle" onClick={()=>setOpen(o=>!o)}>{open?'▾':'▸'} <strong>{label}</strong>{count!==undefined&&<small> ({count})</small>}</button>{open&&children}</div>}

export default function OrganizationTreePage(){
const {districts,branches,atms,isLoading,isError}=useOrgData();
if(isLoading)return <LoadingState label="Building organization hierarchy…"/>;
if(isError)return <ErrorState message="Unable to load the organization hierarchy."/>;
const districtList=districts.data||[];const branchList=branches.data||[];const atmList=atms.data||[];
if(!districtList.length)return <EmptyState title="No districts found in your authorized scope."/>;
return <section className="resource-page"><div className="resource-head"><div><p className="eyebrow accent">ORGANIZATION</p><h1>CBE organization tree</h1><p className="muted">Live hierarchy from Django: Commercial Bank of Ethiopia → Districts → Branches → ATMs.</p></div></div>
<div className="panel resource-panel org-tree">
<TreeSection label="Commercial Bank of Ethiopia (CBE)" count={districtList.length}>
{districtList.map(district=>{
const dBranches=branchList.filter(b=>b.district===district.id);
return <TreeSection key={district.id} label={district.name} count={dBranches.length}>
<div className="tree-meta"><StatusBadge value={district.status}/><small>{district.code}</small></div>
{dBranches.length===0?<p className="muted tree-empty">No branches in this district.</p>:dBranches.map(branch=>{
const bAtms=atmList.filter(a=>a.branch===branch.id);
return <TreeSection key={branch.id} label={branch.name} count={bAtms.length}>
<div className="tree-meta"><StatusBadge value={branch.status}/><small>{branch.code}</small></div>
{bAtms.length===0?<p className="muted tree-empty">No ATMs in this branch.</p>:<ul className="tree-atms">{bAtms.map(atm=><li key={atm.id}><strong>{atm.reference}</strong><StatusBadge value={atm.status}/></li>)}</ul>}
</TreeSection>})}
</TreeSection>})}
</TreeSection>
</div></section>}
