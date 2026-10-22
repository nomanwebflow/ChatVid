// Shared inline SVG bits (bubble tails, read tick, status/header/composer icons).
// Functional UI geometry — same shapes used in the verified chat.html.
export const TailThem = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="19" viewBox="0 0 15 19" fill="none">
    <path d="M7.5 4L7.5 0H15V14C11.3406 17.2528 4.37479 17.8604 1.90001 17.9739C1.59291 17.988 1.43536 17.6021 1.65211 17.3841C3.2998 15.727 7.5 10.8328 7.5 4Z" fill="white"/>
    <path d="M7.16992 -0.330078V4C7.16992 10.6998 3.04651 15.5136 1.41797 17.1514C1.00912 17.5626 1.27945 18.3328 1.91504 18.3037C3.1629 18.2465 5.54456 18.065 8.0791 17.4863C10.6056 16.9095 13.3277 15.9289 15.2197 14.2471L15.3301 14.1484V-0.330078H7.16992Z" fill="white" stroke="black" strokeOpacity="0.06" strokeWidth="0.66"/>
  </svg>
);
export const TailMe = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="19" viewBox="0 0 15 19" fill="none">
    <path d="M7.5 4L7.5 0H0V14C3.65938 17.2528 10.6252 17.8604 13.1 17.9739C13.4071 17.988 13.5646 17.6021 13.3479 17.3841C11.7002 15.727 7.5 10.8328 7.5 4Z" fill="#D0FECF"/>
    <path d="M7.83008 -0.330078V4C7.83008 10.6998 11.9535 15.5136 13.582 17.1514C13.9909 17.5626 13.7206 18.3328 13.085 18.3037C11.8371 18.2465 9.45544 18.065 6.9209 17.4863C4.39444 16.9095 1.67228 15.9289 -0.219727 14.2471L-0.330078 14.1484V-0.330078H7.83008Z" fill="#D0FECF" stroke="black" strokeOpacity="0.06" strokeWidth="0.66"/>
  </svg>
);
export const CheckTick = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 17 17" fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M9.6265 3.84692C9.87393 3.53898 10.3242 3.48942 10.6324 3.73657C10.9404 3.98384 10.9905 4.43415 10.7437 4.74243L4.55814 12.4475C4.43092 12.606 4.2425 12.7029 4.03958 12.7141C3.83663 12.7252 3.63846 12.6497 3.49466 12.5061L0.99466 10.0061C0.715139 9.72659 0.714203 9.27295 0.993684 8.9934C1.27315 8.71411 1.72688 8.71417 2.00638 8.9934L3.94193 10.929L9.6265 3.84692ZM13.7124 3.84692C13.9599 3.53876 14.411 3.48916 14.7193 3.73657C15.0272 3.98391 15.0765 4.43421 14.8296 4.74243L8.64407 12.4475C8.5168 12.606 8.3285 12.703 8.12552 12.7141C7.92253 12.7252 7.72441 12.6498 7.5806 12.5061L6.5806 11.5071C6.30125 11.2277 6.30065 10.774 6.57962 10.4944C6.85902 10.215 7.31275 10.2143 7.59232 10.4934L8.02786 10.928L13.7124 3.84692Z" fill="#007BFC"/>
  </svg>
);

export const avatarDataUri = (hex: string) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2325d366'/%3E%3Cstop offset='1' stop-color='${encodeURIComponent(hex)}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='36' height='36' rx='18' fill='url(%23g)'/%3E%3Ccircle cx='18' cy='14' r='6.2' fill='%23fff' fill-opacity='.92'/%3E%3Cpath d='M6 34c1-7.5 5.5-10.5 12-10.5S29 26.5 30 34z' fill='%23fff' fill-opacity='.92'/%3E%3C/svg%3E`;

export const StatusIcons = () => (
  <>
    <svg width="18" height="11" viewBox="0 0 18 11"><g fill="currentColor">
      <rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/>
      <rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/>
    </g></svg>
    <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.3c2.7 0 5.2 1 7.1 2.8l-1.4 1.4A8 8 0 0 0 8.5 4.3 8 8 0 0 0 2.9 6.5L1.4 5.1A10.2 10.2 0 0 1 8.5 2.3Zm0 3.7c1.7 0 3.3.6 4.5 1.8l-1.4 1.4A5 5 0 0 0 8.5 9.7 5 5 0 0 0 5.4 11L4 9.5A6.9 6.9 0 0 1 8.5 6Zm0 3.4 1.6 1.6-1.6 1.3-1.6-1.3Z"/></svg>
    <svg width="25" height="13" viewBox="0 0 25 13"><rect x="1" y="1" width="20" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".4"/><rect x="2.5" y="2.5" width="17" height="8" rx="1.5" fill="currentColor"/><rect x="22" y="4" width="2" height="5" rx="1" fill="currentColor" fillOpacity=".4"/></svg>
  </>
);
export const Chevron = () => (<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 L3 10 L9 17"/></svg>);
export const CallIcons = () => (<>
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l5-3v10l-5-3"/><rect x="3" y="6" width="12" height="12" rx="2.5"/></svg>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1z"/></svg>
</>);
export const ComposerIcons = () => (<>
  <span className="i-plus"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
  <div className="i-field"><span className="i-placeholder">Message</span>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5b5b5b" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1 2 1.3 3.5 1.3s2.5-.3 3.5-1.3" strokeLinecap="round"/><circle cx="9" cy="10" r="1.1" fill="#5b5b5b" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="#5b5b5b" stroke="none"/></svg>
  </div>
  <div className="i-icons">
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 9.5 4h5a1 1 0 0 1 .85.47L16.3 6h2.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><circle cx="12" cy="12.3" r="3.3"/></svg>
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3" strokeLinecap="round"/></svg>
  </div>
</>);
