import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props={children:ReactNode};
type State={error:Error|null};

export class AppErrorBoundary extends Component<Props,State>{
  state:State={error:null};

  static getDerivedStateFromError(error:Error):State{
    return {error};
  }

  componentDidCatch(error:Error,info:ErrorInfo){
    if(import.meta.env.DEV){
      console.error('3AKSA UI boundary caught an error',error,info.componentStack);
    }
  }

  private retry=()=>{
    this.setState({error:null});
    window.location.reload();
  };

  render(){
    if(!this.state.error)return this.props.children;
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert" aria-live="assertive">
          <div className="brand-lockup">
            <div className="brand-title">عكسة</div>
            <div className="brand-subtitle">3AKSA</div>
          </div>
          <h1>صار خطأ في الواجهة</h1>
          <p>الحساب والبيانات ما زالوا محفوظين. جرّب إعادة فتح الواجهة.</p>
          <button className="primary-button" type="button" onClick={this.retry}>إعادة المحاولة</button>
        </section>
      </main>
    );
  }
}
