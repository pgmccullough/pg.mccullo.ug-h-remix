import { useFetcher, useLoaderData } from "@remix-run/react";

type RentalProperty = {
  _id: string,
  address: string,
  coords: [string, string],
  firstFetch: string,
  id: string,
  images: Array<string>,
  price: string
}

export const RentalProperties: React.FC<{}> = () => {
  const { rentalProperties } = useLoaderData();

  console.log(rentalProperties)

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Rental Properties
          </div>
        </div>
        <div className="postcard__content">
          {rentalProperties?.map((rentalProp: RentalProperty) =>
            <div key={rentalProp._id}>
              {rentalProp.price} - {rentalProp.address}
            </div>
          )}
            
        </div>
      </article>
    </>
  )
};