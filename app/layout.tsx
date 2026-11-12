import './style.css';
import type {Metadata,Viewport} from 'next';
export const metadata:Metadata={
 title:'GOLDEN VAULT | بازی استراتژیک فروش',
 description:'بازی استراتژیک رقابت تیم‌های فروش',
 manifest:'/manifest.webmanifest',
 icons:{icon:'/golden-vault-icon.svg',apple:'/golden-vault-icon.svg'},
 appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Golden Vault'},
};
export const viewport:Viewport={themeColor:'#23190e',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
