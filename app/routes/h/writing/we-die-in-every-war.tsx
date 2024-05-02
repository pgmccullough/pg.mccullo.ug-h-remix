import { useState } from "react";

const pages = [
  ``,
  <div className="writing">
    <h2 style={{margin: "0.5rem 0 3.5rem 0"}}>A SUPERNATURAL HORROR</h2>
    <h1 style={{margin: "0.5rem 0 2.5rem 0"}}>WE DIE IN EVERY WAR</h1>
    <h2 style={{margin: "0.5rem 0 0.5rem 0"}}>By</h2>
    <h2>
      <span className="cap">P</span>ATRICK
      <span className="cap"> G</span>LENDON
      <span className="cap"> M</span>C<span className="cap">C</span>ULLOUGH
    </h2>
    <div className="covericon"></div>
    <h2 style={{marginTop: '16vh'}}>POPULAR LIBRARY</h2>
    <h3 style={{margin: '0'}}>NEW YORK</h3>
  </div>,
  <div className="writing">
    <p>“<span className="chapCap">W</span><span className="chapUps">e fall</span> before the curtain,
      <div className="line" />
      <div className="tab" />before the victory.<div className="line" />
      Nor have we met the gallows.<div className="line" />
      We’re Nebo-perched to see 
      <div className="line" />
      <div className="tab" />forever spreading nowhere,<div className="line" />
      <div className="tab" />God’s lidless winking eye.<div className="line" />
      Parched tongues in dumb mouths buried<div className="line" />
      <div className="tab" />as choked off as the sky<div className="line" />
      <div className="line" />
      which, vaunted, deigns no answer<div className="line" />
      <div className="tab" />to whines of whence or for,<div className="line" />
      <div className="tab" />proclaiming once and ever:<div className="line" />
      We die in every war.”  <div className="break" />
      Roebuck, E. (2025) ‘warsend’, in Tompkins, E. (ed.) <em>Selected Posthumae of Eden Roebuck</em>. London: Hamish Hamilton, pp. 38-39.
    </p>
  </div>,
  <div className="writing">
    <p>
      <div className="chapNum">I</div>
      <div className="break" />
      <span className="chapCap">C</span><span className="chapUps">oming off</span> a real stolid bender one’s pulse gets all fizzly. You keep putting fingers to the carotid just under your jaw to see if your heart is really giving out or it's just what the Irish call The Fear, or Kingsley Amis dubbed the metaphysical hangover. 
      <br /><div className="tab" />My jaw was perched on the lip of the semi-truck’s passenger side door, my cheek and nose pressed against the glass. My teeth clattered against the soothing bump bump bump of sixteen wheels along route two two one. It could not have been more than an hour past dawn and the world was pink.
      <br /><div className="tab" />A touch of anxiety had me crawling out of my skin, so when the truck rolled to a stop at the traffic light of a large intersection, I gave an abrupt: “This looks good, thanks!” and hopped out of the passenger side, sweeping up my backpack in a single motion.
      <br /><div className="tab" />It’s wild to think that so flippantly, and on such a whim, I found myself in Roebuck, South Carolina, where I would become entwined in the events that I here intend to set down before you, dear reader.
      <br /><div className="tab" />The multi-lane intersection seemed like a misunderstanding, flanked as it was by little more than a Hardees, and a strip mall with an insurance agency and a gun shop. If the morning rush hour was any indication, a person could probably take a long nap right in the middle of it without being much inconvenienced. Mostly, flat scrub spread out forever.
      <br /><div className="tab" />The temptation would be to call it a small town, but I learned later that would have been too generous. It falls into the category south of town, village, even hamlet: Roebuck is only a “census-designated place”.
      <br /><div className="tab" />A quick bit of research made me second-guess my stop. There didn’t seem to be any professional-type bars (the sort that open eight-or-nine in the morning). No real dedicated bars at all, in fact. Just the combination sports bar restaurants that don’t open until eleven and are usually loud and overlit and

    </p>
  </div>
]

const WeDieInEveryWar = () => {
  const [ curPage, setCurPage ] = useState(0)
  return (
    <main className="writingMain">
      <div className="pagesbg">
      <div 
          className="pageodd"
          onClick={() => setCurPage(curPage-2)}
        >
          {pages[curPage]}
        </div>
        <div 
          className="pageeven"
          onClick={() => setCurPage(curPage+2)}
        >
          {pages[curPage+1]}
        </div>
      </div>
    </main>
  )
}

export default WeDieInEveryWar;