use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("ChangeLog Event Malformed")]
    ChangeLogEventMalformed,


}