import {PatientShell} from "@/components/PatientShell";
import {RequireAuth} from "@/components/RequireAuth";
import {RoleGate} from "@/components/RoleGate";
import {CareConversation} from "@/components/CareConversation";
export default function MessagesPage(){return <PatientShell><RequireAuth><RoleGate allowed={["patient"]}><div className="patient-screen"><CareConversation/></div></RoleGate></RequireAuth></PatientShell>;}
