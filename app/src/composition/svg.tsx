// Chat UI icons. Every mark is the exact Figma asset (public/figma/*), loaded via
// staticFile() so it resolves in both the Player and the Remotion render bundle.
// Sizes follow each SVG's own root width/height; CSS only positions them.
import { staticFile } from "remotion";

const A = (name: string) => staticFile(`figma/${name}`);

// bubble tails: 15 x 18.63 (design lets the tail run 3.52% past the bubble bottom)
export const TailMe = () => <img className="tail-img" src={A("tail-me.svg")} alt="" />;
export const TailThem = () => <img className="tail-img" src={A("tail-friend.svg")} alt="" />;

// read receipt (double blue tick), 17 x 17
export const CheckTick = () => <img src={A("check-read.svg")} width={17} height={17} alt="" />;

export const avatarDataUri = (hex: string) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2325d366'/%3E%3Cstop offset='1' stop-color='${encodeURIComponent(hex)}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='36' height='36' rx='18' fill='url(%23g)'/%3E%3Ccircle cx='18' cy='14' r='6.2' fill='%23fff' fill-opacity='.92'/%3E%3Cpath d='M6 34c1-7.5 5.5-10.5 12-10.5S29 26.5 30 34z' fill='%23fff' fill-opacity='.92'/%3E%3C/svg%3E`;

// status bar: cellular 19.33x12.33, wifi 17x12.33, battery 27.34x13.67 with its "100" label
export const StatusIcons = () => (
  <>
    <img src={A("cellular.svg")} width={19.3333} height={12.3333} alt="" />
    <img src={A("wifi.svg")} width={17} height={12.3333} alt="" />
    <span className="battery">
      <img src={A("battery.svg")} width={27.3369} height={13.6699} alt="" />
      <span className="battery-pct">100</span>
    </span>
  </>
);

export const Chevron = () => <img src={A("chevron.svg")} width={32} height={32} alt="" />;

export const CallIcons = () => (
  <>
    <img src={A("video.svg")} width={32} height={32} alt="" />
    <img src={A("phone.svg")} width={32} height={32} alt="" />
  </>
);

// composer: plus, input field (empty text + sticker), camera + mic
export const ComposerIcons = () => (
  <>
    <span className="i-plus"><img src={A("plus.svg")} width={32} height={32} alt="" /></span>
    <div className="i-field">
      <div className="i-text" />
      <img src={A("sticker.svg")} width={24} height={24} alt="" />
    </div>
    <div className="i-icons">
      <img src={A("camera.svg")} width={32} height={32} alt="" />
      <img src={A("mic.svg")} width={32} height={32} alt="" />
    </div>
  </>
);
