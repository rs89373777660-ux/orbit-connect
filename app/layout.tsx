import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Orbit Connect — мессенджер",description:"Сообщения, файлы, группы и защищённые звонки на любом устройстве.",manifest:"/manifest.webmanifest",icons:{icon:"/orbit-connect-icon-192.png",apple:"/orbit-connect-icon-180.png"},appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"Orbit Connect"}};
export const viewport:Viewport={themeColor:"#10120e",width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
