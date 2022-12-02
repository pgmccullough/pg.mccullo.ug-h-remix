import { Link } from 'react-router-dom';
import { useLoaderData } from "@remix-run/react";
import { SiteData } from '../../common/types';
import { stampToTime } from '../../functions/functions';

export const Header: React.FC<{}> = () => {
    const { user, siteData } = useLoaderData();
    return (
        <header className="header">
            <div className="header__cover">
                <img src={siteData?.cover_image?.image} width="100%" alt={siteData?.site_name} />  
                <div className="header__text">
                    <h1 className="header__h1">
                        {siteData?.watchword?.word}
                    </h1>
                    {siteData&&siteData.cover_image?
                    <div className="header__p">
                        cover: {stampToTime(siteData?.cover_image?.timestamp/1000)}
                        <a 
                            className="gpsPinLink" 
                            href={`https://www.google.com/maps/search/${siteData?.cover_image?.gps?.lat},${siteData?.cover_image?.gps?.long}`} 
                            rel="noreferrer"
                            target="_BLANK"
                        >
                            <div className="gpsPin" />
                        </a>
                        <div className="gpsCoords">
                            <a 
                                href={`https://www.google.com/maps/search/${siteData?.cover_image?.gps?.lat},${siteData?.cover_image?.gps?.long}`}
                                rel="noreferrer"
                                target="_BLANK"
                            >
                                {siteData?.cover_image?.gps?.string}
                            </a>
                        </div>
                    </div>
                    :""}
                    {siteData&&siteData.profile_image?
                    <div className="header__p">profile: {stampToTime(siteData?.profile_image?.timestamp/1000)}
                        <a 
                            className="gpsPinLink" 
                            href={`https://www.google.com/maps/search/${siteData?.profile_image?.gps?.lat},${siteData?.profile_image?.gps?.long}`} 
                            rel="noreferrer"
                            target="_BLANK"
                        >
                            <div className="gpsPin" />
                        </a>
                        <div className="gpsCoords">
                            <a 
                                href={`https://www.google.com/maps/search/${siteData?.profile_image?.gps?.lat},${siteData?.profile_image?.gps?.long}`} 
                                rel="noreferrer"
                                target="_BLANK"
                            >
                                {siteData?.profile_image?.gps?.string}
                            </a>
                        </div>
                    </div>
                    :""}
                </div>
            </div>
            <div className="header__bar">
                {user?.role==="administrator"?"lexical":siteData.site_name}
            </div>
            <Link to="/h/">
                <div 
                    className="header__profile" 
                    style={{backgroundImage: `url('${siteData?.profile_image?.image}')`}}
                />
            </Link>
        </header>
    )
}