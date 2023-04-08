import { EmailInterface } from '~/common/types';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime)
dayjs().format();
dayjs.locale('en');

export const Snippet: React.FC<{ 
    alterEmailArray: any,
    checkedSnippets: string[],
    currentEmail: any,
    email: EmailInterface, 
    emailArray: EmailInterface[],
    emNotif: any;
    setCheckedSnippets: any,
    setCurrentEmail: any
}> = ({ alterEmailArray, checkedSnippets, currentEmail, email, emailArray, setCheckedSnippets, setCurrentEmail }) => {
  
return <>hang on</>





}