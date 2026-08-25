import {Navigate,useLocation} from 'react-router-dom'; import {PropsWithChildren,ReactNode} from 'react'; import {useAuth,hasPermission} from '../../context/AuthContext'; import {LoadingState} from '../feedback/StateView';

export function ProtectedRoute({children}:PropsWithChildren){const {isAuthenticated,isLoading}=useAuth();const location=useLocation();if(isLoading)return <div className="auth-loading"><LoadingState label="Checking your session…"/></div>;if(!isAuthenticated)return <Navigate to="/login" replace state={{from:location.pathname}}/>;return <>{children}</>}

export function PermissionRoute({permission,children}:{permission:string;children:ReactNode}){const {currentUser}=useAuth();if(!hasPermission(currentUser,permission))return <Navigate to="/access-denied" replace/>;return <>{children}</>}
