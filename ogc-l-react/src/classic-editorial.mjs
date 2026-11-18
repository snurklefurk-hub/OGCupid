// Editorial text approved in the OG Cupid project wiki, November 18, 2026.
// Exactly six different cards per full refresh, never fabricated sponsors.
export const SITE_PROMOTIONS=Object.freeze([
  {title:"You're More Than a Selfie",body:"Nine profile essays. Plenty of room to explain why you're worth getting to know.",destination:"profile"},
  {title:"Answer Some Questions",body:"The more you put in, the more you get out.",destination:"questions"},
  {title:"Dealbreakers Welcome",body:"Some things matter more than others.",destination:"questions"},
  {title:"Explain Yourself",body:"Your answer is interesting. Your reasoning might be even more interesting. Add an explanation to any match question.",destination:"questions"},
  {title:"It's Complicated",body:"Match, Friend, and Enemy percentages. Because compatibility isn't always a simple yes or no."},
  {title:"Changed Your Mind?",body:"Your answers aren't carved in stone. Revisit your match questions whenever you feel differently.",destination:"questions"},
  {title:"What's Your Dating Persona?",body:"Loverboy? Nymph? Something considerably less flattering? Take the Dating Persona Test and find out.",destination:"persona"},
  {title:"Collect Personality Awards",body:"Your answers reveal more than compatibility. Find out what they say about your personality.",destination:"personality"},
  {title:"Read Before You Swipe",body:"Just kidding. There's no swiping here. You'll have to learn something about a person instead."},
  {title:"Filters. Remember Those?",body:"Search for what you're actually looking for. Revolutionary technology from approximately 2005.",destination:"matches"},
  {title:"Are They Even Here?",body:"See when somebody was last online. No more wondering whether you're messaging a ghost."},
  {title:"Who's Been Looking?",body:"Somebody checked out your profile. Curious? See who's been stopping by."},
  {title:"Start a Conversation",body:"You've read their profile. You've compared your answers. Now try saying something interesting."},
  {title:"A Little Serendipity",body:"Meet someone you might not have searched for yourself. Sometimes that's how the good stories start."},
  {title:"Everybody, Get In Here",body:"Dating doesn't have to be a series of private conversations. Come hang out on the community board."},
  {title:"Find Your People",body:"Obscure hobbies? Unusual interests? There's probably somebody else here who's into that."},
  {title:"Think You're Clever?",body:"Create your own quiz and see how everyone else measures up to your questionable standards."},
  {title:"Numbers Don't Lie. Usually.",body:"Visit OgTrends for observations, statistics, and uncomfortable truths about online dating.",destination:"ogtrends"},
  {title:"Earn Your OG Status",body:"Build a great profile. Be good to the community. Earn your way out of membership fees permanently."},
  {title:"The Original OGs",body:"The first 250 members to complete a profile get lifetime OG Status and a Founder Profile badge."}
].map(p=>Object.freeze(p)));
export const PROFILE_REFINEMENTS=Object.freeze([
  {title:"Give Them Something to Read",body:"Your photos might catch their eye. Your words are what give them a reason to stay.",destination:"essays"},
  {title:"Picture Perfect?",body:"That photo from six years ago might deserve retirement. Show people who you are today.",destination:"photos"},
  {title:"The Devil's in the Details",body:"A few little details can make a big difference. Make sure yours are up to date.",destination:"details"},
  {title:"Still Stand by That?",body:"People change their minds. Revisit your match questions and make sure your answers still reflect yours.",destination:"questions"},
  {title:"Know Thyself",body:"What do your answers say about you? Explore your personality traits and see how you're shaping up.",destination:"personality"}
].map(p=>Object.freeze(p)));

export function drawDistinct(items,count,rng=Math.random) {
  const pool=items.slice(),drawn=[];
  for(let i=0;i<Math.min(count,pool.length);i++){
    const n=Math.min(pool.length-1,Math.max(0,Math.floor(rng()*pool.length)));
    drawn.push(pool.splice(n,1)[0]);
  }
  return drawn;
}
// Module-level selection: route changes do not shuffle or flash; page reload does.
export const PAGE_PROMOTIONS=Object.freeze(drawDistinct(SITE_PROMOTIONS,6));
export const PAGE_REFINEMENT=drawDistinct(PROFILE_REFINEMENTS,1)[0];

export function promotionDestination(destination,slug) {
  switch(destination){
    case "profile":return slug?"/profiles/"+slug:null;
    case "personality":return slug?"/profiles/"+slug+"?tab=personality":null;
    case "questions":return "/questions";
    case "matches":return "/matches";
    case "persona":return "/account/persona.html";
    case "ogtrends":return "/ogtrends/";
    default:return null;
  }
}
export function refinementDestination(destination,slug) {
  switch(destination){
    case "essays":return slug?"/profiles/"+slug+"?tab=about":null;
    case "photos":return slug?"/profiles/"+slug+"?tab=photos":null;
    case "details":return "/settings";
    case "questions":return slug?"/profiles/"+slug+"?tab=questions":null;
    case "personality":return slug?"/profiles/"+slug+"?tab=personality":null;
    default:return null;
  }
}
