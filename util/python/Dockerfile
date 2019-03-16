#FROM tootallnate/osx-cross
FROM lambci/lambda:build-provided

# Compile Python
WORKDIR /usr/src/python
ARG PYTHON_VERSION="2.7.12"
RUN curl -sfLS "https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz" | tar xzv --strip-components=1
RUN ./configure \
	--host="${CHOST}" \
	--build="${CBUILD}" \
	--prefix="/binaries/python-${PYTHON_VERSION}"
RUN make
RUN make install
RUN ln -sf "python${PYTHON_VERSION:0:1}" "/binaries/python-${PYTHON_VERSION}/bin/python"

WORKDIR "/binaries/python-${PYTHON_VERSION}"
RUN find . -name '*.pyc' -exec rm -rfv {} \;
RUN find . -name '__pycache__' -print0 | xargs -0 rm -rfv

ENV PYTHON_VERSION="${PYTHON_VERSION}"
COPY ./copy.sh /

CMD ["/copy.sh"]
