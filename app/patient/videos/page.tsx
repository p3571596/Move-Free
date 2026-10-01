import {PatientShell} from "@/components/PatientShell";
import {RequireAuth} from "@/components/RequireAuth";
import {RoleGate} from "@/components/RoleGate";
import {VideoWorkspace} from "@/components/VideoWorkspace";
export default function VideosPage(){return <PatientShell><RequireAuth><RoleGate allowed={["patient"]}><div className="patient-screen"><VideoWorkspace/></div></RoleGate></RequireAuth></PatientShell>;}
